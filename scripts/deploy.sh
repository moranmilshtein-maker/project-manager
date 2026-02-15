#!/bin/bash

# Deployment script for Project Manager
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
PROJECT_DIR="/var/www/project-manager"
BACKUP_DIR="/var/backups/project-manager"

echo "🚀 Starting deployment to $ENVIRONMENT..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_message() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as correct user
if [ "$EUID" -eq 0 ]; then 
    print_error "Please do not run as root"
    exit 1
fi

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# 1. Backup current version
print_message "Creating backup..."
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).tar.gz"
cd "$PROJECT_DIR"
tar -czf "$BACKUP_FILE" --exclude='node_modules' --exclude='.git' .
print_message "Backup created: $BACKUP_FILE"

# 2. Backup database
print_message "Backing up database..."
DB_BACKUP_FILE="$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump -U project_user project_manager > "$DB_BACKUP_FILE"
print_message "Database backup created: $DB_BACKUP_FILE"

# 3. Pull latest code
print_message "Pulling latest code from GitHub..."
git fetch --all
git pull origin main

# 4. Install dependencies
print_message "Installing dependencies..."
npm install --production

# 5. Run database migrations if any
print_message "Running database migrations..."
# Add migration commands here if you have them
# npm run migrate

# 6. Restart application
print_message "Restarting application..."
pm2 restart project-manager

# 7. Wait for application to start
print_message "Waiting for application to start..."
sleep 5

# 8. Health check
print_message "Performing health check..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ "$HEALTH_CHECK" -eq 200 ]; then
    print_message "✅ Deployment successful!"
    print_message "Application is running and healthy"
    
    # Keep only last 5 backups
    print_message "Cleaning old backups..."
    cd "$BACKUP_DIR"
    ls -t backup_*.tar.gz | tail -n +6 | xargs -r rm --
    ls -t db_backup_*.sql | tail -n +6 | xargs -r rm --
    
else
    print_error "❌ Health check failed!"
    print_warning "Rolling back..."
    
    # Rollback
    tar -xzf "$BACKUP_FILE" -C "$PROJECT_DIR"
    pm2 restart project-manager
    
    print_error "Deployment failed. Rolled back to previous version."
    exit 1
fi

# 9. Reload Nginx
print_message "Reloading Nginx..."
sudo systemctl reload nginx

print_message "🎉 Deployment completed successfully!"
print_message "Version: $(git rev-parse --short HEAD)"
print_message "Time: $(date)"

# Send notification (optional - integrate with Slack, Discord, etc.)
# curl -X POST -H 'Content-type: application/json' \
#   --data '{"text":"Project Manager deployed successfully!"}' \
#   YOUR_WEBHOOK_URL
