/**
 * file-storage.js — Cloudflare R2 file storage module
 * Handles upload, delete, and usage tracking for workspace file attachments
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');
const mimeTypes = require('mime-types');

// ===== Configuration =====
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'butterli-files';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''; // e.g. https://files.butterli.co.il or R2 public bucket URL

// Storage limits (Free tier: 10GB)
const STORAGE_LIMIT_BYTES = parseInt(process.env.STORAGE_LIMIT_BYTES || String(10 * 1024 * 1024 * 1024)); // 10GB default
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB total per upload request

// Blocked file extensions (dangerous executables)
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.ps1xml', '.ps2', '.ps2xml', '.psc1', '.psc2',
  '.reg', '.inf', '.lnk', '.cpl', '.hta', '.msp', '.mst',
  '.dll', '.sys', '.drv', '.ocx'
];

// Blocked MIME types
const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec'
];

// Initialize S3 client for R2
let s3Client = null;

function getS3Client() {
  if (!s3Client && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
}

function isConfigured() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Validate file before upload
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFile(originalName, mimeType, size) {
  // Check size
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large: ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit of 100MB` };
  }

  // Check extension
  const ext = path.extname(originalName).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `File type not allowed: ${ext} (security risk)` };
  }

  // Check MIME type
  if (BLOCKED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `File type not allowed: ${mimeType} (security risk)` };
  }

  return { valid: true };
}

/**
 * Upload a file buffer to R2
 * @param {Buffer} fileBuffer - The file data
 * @param {string} originalName - Original file name
 * @param {string} mimeType - MIME type
 * @param {string} workspaceId - Workspace ID for namespacing
 * @returns {Promise<{ success: boolean, file?: object, error?: string }>}
 */
async function uploadFile(fileBuffer, originalName, mimeType, workspaceId) {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: 'File storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY environment variables.' };
  }

  // Validate
  const validation = validateFile(originalName, mimeType, fileBuffer.length);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Generate unique key
  const fileId = crypto.randomUUID();
  const ext = path.extname(originalName);
  const safeFileName = `${fileId}${ext}`;
  const key = `workspaces/${workspaceId}/${safeFileName}`;

  try {
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        'original-name': encodeURIComponent(originalName),
        'workspace-id': workspaceId,
        'uploaded-at': new Date().toISOString()
      }
    }));

    // Build public URL
    const publicUrl = R2_PUBLIC_URL 
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    return {
      success: true,
      file: {
        id: fileId,
        name: originalName,
        key: key,
        type: mimeType,
        size: fileBuffer.length,
        url: publicUrl,
        uploadedAt: new Date().toISOString()
      }
    };
  } catch (err) {
    console.error('[FileStorage] Upload error:', err.message);
    return { success: false, error: `Upload failed: ${err.message}` };
  }
}

/**
 * Upload a base64 data URL to R2 (for migration)
 * @param {string} dataUrl - base64 data URL (data:image/png;base64,...)
 * @param {string} workspaceId - Workspace ID
 * @param {string} [fileName] - Optional file name
 * @returns {Promise<{ success: boolean, file?: object, error?: string }>}
 */
async function uploadBase64(dataUrl, workspaceId, fileName) {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { success: false, error: 'Invalid data URL' };
  }

  // Parse data URL
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    return { success: false, error: 'Cannot parse data URL' };
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = mimeTypes.extension(mimeType) || 'bin';
  const name = fileName || `image_${Date.now()}.${ext}`;

  return uploadFile(buffer, name, mimeType, workspaceId);
}

/**
 * Delete a file from R2
 * @param {string} key - The R2 object key
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function deleteFile(key) {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: 'File storage not configured' };
  }

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key
    }));
    return { success: true };
  } catch (err) {
    console.error('[FileStorage] Delete error:', err.message);
    return { success: false, error: `Delete failed: ${err.message}` };
  }
}

/**
 * Get storage usage for a workspace (or total)
 * @param {string} [workspaceId] - Optional workspace ID filter
 * @returns {Promise<{ success: boolean, usage?: object, error?: string }>}
 */
async function getStorageUsage(workspaceId) {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: 'File storage not configured' };
  }

  const prefix = workspaceId ? `workspaces/${workspaceId}/` : 'workspaces/';
  let totalSize = 0;
  let fileCount = 0;
  let continuationToken;

  try {
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }));

      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size || 0;
          fileCount++;
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    const usagePercent = (totalSize / STORAGE_LIMIT_BYTES) * 100;
    let status = 'green'; // healthy
    if (usagePercent >= 90) status = 'red';
    else if (usagePercent >= 70) status = 'orange';

    return {
      success: true,
      usage: {
        totalBytes: totalSize,
        totalFormatted: formatBytes(totalSize),
        fileCount,
        limitBytes: STORAGE_LIMIT_BYTES,
        limitFormatted: formatBytes(STORAGE_LIMIT_BYTES),
        usagePercent: Math.round(usagePercent * 10) / 10,
        status // 'green' | 'orange' | 'red'
      }
    };
  } catch (err) {
    console.error('[FileStorage] Usage check error:', err.message);
    return { success: false, error: `Usage check failed: ${err.message}` };
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  isConfigured,
  validateFile,
  uploadFile,
  uploadBase64,
  deleteFile,
  getStorageUsage,
  formatBytes,
  MAX_FILE_SIZE,
  MAX_UPLOAD_SIZE,
  STORAGE_LIMIT_BYTES,
  BLOCKED_EXTENSIONS,
  BLOCKED_MIME_TYPES
};
