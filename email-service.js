/**
 * Email Service - Resend Integration
 * Handles invitations, notifications, and organization-context emails
 * 
 * BiDi Strategy for RTL Hebrew + LTR English mixed content:
 * - Use &#x2066; (LRI) before English text and &#x2069; (PDI) after it
 *   to create an isolated LTR embedding that doesn't affect surrounding RTL punctuation
 * - This is the Unicode BiDi Isolate approach (UAX #9) which is the most reliable
 *   for email clients that support Unicode but may strip HTML dir attributes
 */

const { Resend } = require('resend');

// Configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_8kmEWxhe_7qgbrdyB3TiPFDtwTSzThQZa';
const APP_URL = process.env.APP_URL || 'https://butterli.io';
const FROM_EMAIL = process.env.FROM_EMAIL || 'butterli <invite@butterli.io>';

const resend = new Resend(RESEND_API_KEY);

// LRI = Left-to-Right Isolate, PDI = Pop Directional Isolate
// These Unicode characters isolate English text within RTL context
// preventing punctuation from being misplaced
const LRI = '&#x2066;';
const PDI = '&#x2069;';

/**
 * Generate HTML email template for invitations
 */
function getInviteEmailHTML(inviterName, orgName, inviteLink) {
    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0; padding:0; background:#f5f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; direction:rtl; unicode-bidi:embed;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8; padding:40px 0;" dir="rtl">
        <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr><td style="background: linear-gradient(135deg, #6161ff 0%, #7b68ee 100%); padding:32px; text-align:center;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <circle cx="6" cy="18" r="4" fill="#ff3d57"/>
                            <circle cx="12" cy="8" r="4" fill="#ffcb00"/>
                            <circle cx="18" cy="18" r="4" fill="#00ca72"/>
                        </svg>
                    </div>
                    <h1 style="color:#ffffff; margin:12px 0 0; font-size:24px; font-weight:600; direction:ltr; unicode-bidi:bidi-override;">butterli</h1>
                    <p style="color:rgba(255,255,255,0.85); margin:4px 0 0; font-size:13px; direction:ltr; unicode-bidi:bidi-override;">butterli.io</p>
                </td></tr>
                
                <!-- Body -->
                <tr><td style="padding:40px 32px;" dir="rtl">
                    <h2 style="color:#323338; font-size:20px; margin:0 0 16px; text-align:center; direction:rtl;">&#x200F;הוזמנת להצטרף!</h2>
                    <p style="color:#676879; font-size:15px; line-height:1.6; text-align:center; margin:0 0 8px; direction:rtl;">
                        &#x200F;<strong style="color:#323338;">${inviterName}</strong> מזמין אותך להצטרף ל:
                    </p>
                    <p style="color:#6161ff; font-size:18px; font-weight:600; text-align:center; margin:0 0 32px;">
                        ${orgName}
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr><td align="center">
                            <a href="${inviteLink}" style="display:inline-block; background:#6161ff; color:#ffffff; text-decoration:none; padding:14px 40px; border-radius:8px; font-size:16px; font-weight:600; box-shadow: 0 4px 12px rgba(97,97,255,0.3);">
                                הצטרף עכשיו
                            </a>
                        </td></tr>
                    </table>
                    
                    <p style="color:#999; font-size:12px; text-align:center; margin:32px 0 0; direction:rtl;">
                        &#x200F;הלינק תקף ל-7 ימים. אם לא ביקשת הזמנה זו, ניתן להתעלם מהודעה זו.
                    </p>
                </td></tr>
                
                <!-- Footer -->
                <tr><td style="background:#f5f6f8; padding:20px 32px; text-align:center; border-top:1px solid #ecedf0;" dir="rtl">
                    <p style="color:#999; font-size:11px; margin:0; direction:rtl;">
                        &#x200F;נשלח מ-${LRI}butterli${PDI}
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}

/**
 * Generate HTML email template for notifications
 */
function getNotificationEmailHTML(userName, subject, bodyText, orgName, ctaText, ctaLink) {
    // Process bodyText to isolate English segments within Hebrew RTL
    const processedBody = bodyText
        .replace(/\bbutterli\b/g, `${LRI}butterli${PDI}`);
    
    // Process subject similarly
    const processedSubject = subject
        .replace(/\bbutterli\b/g, `${LRI}butterli${PDI}`);

    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0; padding:0; background:#f5f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; direction:rtl; unicode-bidi:embed;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8; padding:40px 0;" dir="rtl">
        <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr><td style="background: linear-gradient(135deg, #6161ff 0%, #7b68ee 100%); padding:24px; text-align:center;">
                    <h1 style="color:#ffffff; margin:0; font-size:20px; font-weight:600; direction:ltr; unicode-bidi:bidi-override;">butterli</h1>
                    ${orgName ? `<p style="color:rgba(255,255,255,0.85); margin:4px 0 0; font-size:12px;">${orgName}</p>` : ''}
                </td></tr>
                
                <!-- Body -->
                <tr><td style="padding:32px;" dir="rtl">
                    <p style="color:#676879; font-size:14px; margin:0 0 8px; direction:rtl;">&#x200F;שלום ${userName},</p>
                    <h2 style="color:#323338; font-size:18px; margin:0 0 16px; direction:rtl;">&#x200F;${processedSubject}</h2>
                    <p style="color:#676879; font-size:14px; line-height:1.6; margin:0 0 24px; direction:rtl;">&#x200F;${processedBody}</p>
                    
                    ${ctaText && ctaLink ? `
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr><td align="center">
                            <a href="${ctaLink}" style="display:inline-block; background:#6161ff; color:#ffffff; text-decoration:none; padding:12px 32px; border-radius:8px; font-size:14px; font-weight:600; direction:rtl;">
                                &#x200F;${ctaText.replace(/\bbutterli\b/g, LRI + 'butterli' + PDI)}
                            </a>
                        </td></tr>
                    </table>` : ''}
                </td></tr>
                
                <!-- Footer -->
                <tr><td style="background:#f5f6f8; padding:16px 32px; text-align:center; border-top:1px solid #ecedf0;" dir="rtl">
                    <p style="color:#999; font-size:11px; margin:0; direction:rtl;">
                        &#x200F;נשלח מ-${LRI}butterli${PDI} | <a href="${APP_URL}" style="color:#6161ff; text-decoration:none;">&#x200F;פתח את ${LRI}butterli${PDI}</a>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}

/**
 * Send an invitation email
 */
async function sendInviteEmail(toEmail, inviterName, orgName, inviteToken) {
    const inviteLink = `${APP_URL}?invite=${inviteToken}`;
    
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: `\u200F${inviterName} מזמין אותך להצטרף ל-${orgName} ב-butterli`,
            html: getInviteEmailHTML(inviterName, orgName, inviteLink)
        });

        if (error) {
            console.error('[Email] Failed to send invite:', error);
            return { success: false, error: error.message };
        }

        console.log(`[Email] Invite sent to ${toEmail}, id: ${data.id}`);
        return { success: true, emailId: data.id };
    } catch (e) {
        console.error('[Email] Error sending invite:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Send a notification email
 */
async function sendNotificationEmail(toEmail, userName, subject, bodyText, orgName, ctaText, ctaLink) {
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: `\u200F${subject}`,
            html: getNotificationEmailHTML(userName, subject, bodyText, orgName, ctaText, ctaLink)
        });

        if (error) {
            console.error('[Email] Failed to send notification:', error);
            return { success: false, error: error.message };
        }

        console.log(`[Email] Notification sent to ${toEmail}, id: ${data.id}`);
        return { success: true, emailId: data.id };
    } catch (e) {
        console.error('[Email] Error sending notification:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Send bulk notification to multiple users (respects email preferences)
 */
async function sendBulkNotification(recipients, subject, bodyText, orgName, ctaText, ctaLink) {
    const results = [];
    
    for (const recipient of recipients) {
        // Skip if user opted out of emails
        if (recipient.emailPrefs && recipient.emailPrefs.notifications === false) {
            results.push({ email: recipient.email, skipped: true, reason: 'opted_out' });
            continue;
        }

        const result = await sendNotificationEmail(
            recipient.email,
            recipient.fullName || 'User',
            subject,
            bodyText,
            orgName,
            ctaText,
            ctaLink
        );
        results.push({ email: recipient.email, ...result });
        
        // Rate limit: small delay between emails
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
}

module.exports = {
    sendInviteEmail,
    sendNotificationEmail,
    sendBulkNotification,
    getInviteEmailHTML,
    getNotificationEmailHTML
};
