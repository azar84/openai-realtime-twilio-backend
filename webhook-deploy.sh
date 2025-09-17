#!/bin/bash

# Webhook-based deployment script for VPS
# This script can be called by GitHub webhooks or run manually

set -e

echo "🚀 Starting webhook deployment..."
echo "=================================="

# Configuration
VPS_HOST="51.222.142.170"
VPS_USER="debian"
VPS_PASSWORD="htc792980"
REPO_URL="https://github.com/yourusername/openai-realtime-twilio-demo.git"

# Check if required environment variables are set
echo "🔍 Checking environment variables..."
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY environment variable is required"
    exit 1
fi

if [ -z "$TWILIO_ACCOUNT_SID" ]; then
    echo "❌ Error: TWILIO_ACCOUNT_SID environment variable is required"
    exit 1
fi

if [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo "❌ Error: TWILIO_AUTH_TOKEN environment variable is required"
    exit 1
fi

echo "✅ Environment variables validated"

# Create deployment directory
echo "📦 Preparing deployment files..."
rm -rf deployment-production
mkdir -p deployment-production

# Clone or update repository
echo "📋 Cloning repository..."
if [ -d "temp-repo" ]; then
    cd temp-repo
    git pull origin main
    cd ..
else
    git clone $REPO_URL temp-repo
fi

# Copy necessary files
echo "📋 Copying application files..."
cp temp-repo/Dockerfile.production deployment-production/Dockerfile
cp -r temp-repo/packages deployment-production/
cp -r temp-repo/database deployment-production/
cp -r temp-repo/docker deployment-production/

# Create production environment file
echo "⚙️  Creating production environment configuration..."
cat > deployment-production/.env << EOF
# Database Configuration
DB_NAME=openai_realtime_db
DB_USER=postgres
DB_PASSWORD=postgres123

# OpenAI Configuration
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-realtime-preview-2024-10-01

# Twilio Configuration
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER:-}

# Server Configuration
PUBLIC_URL=http://${VPS_HOST}
NODE_ENV=production
DEBUG=false
PORT=8081

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=ws://${VPS_HOST}:8081
WEBSOCKET_SERVER_URL=http://${VPS_HOST}:8081

# Tool Integration (optional)
N8N_TOOL_URL=${N8N_TOOL_URL:-}
N8N_SECRET=${N8N_SECRET:-}

# Audio Configuration
AUDIO_FORMAT=g711_ulaw
EOF

# Create docker-compose file for production
echo "🐳 Creating production docker-compose configuration..."
cat > deployment-production/docker-compose.yml << EOF
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: openai-realtime-app
    environment:
      # Database Configuration
      - DB_HOST=localhost
      - DB_PORT=5432
      - DB_NAME=openai_realtime_db
      - DB_USER=postgres
      - DB_PASSWORD=postgres123
      
      # OpenAI Configuration
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=gpt-4o-realtime-preview-2024-10-01
      
      # Twilio Configuration
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER:-}
      
      # Server Configuration
      - PUBLIC_URL=http://${VPS_HOST}
      - NODE_ENV=production
      - DEBUG=false
      - PORT=8081
      
      # WebSocket Configuration
      - NEXT_PUBLIC_WS_URL=ws://${VPS_HOST}:8081
      - WEBSOCKET_SERVER_URL=http://${VPS_HOST}:8081
      
      # Tool Integration (optional)
      - N8N_TOOL_URL=${N8N_TOOL_URL:-}
      - N8N_SECRET=${N8N_SECRET:-}
      
      # Audio Configuration
      - AUDIO_FORMAT=g711_ulaw
    ports:
      - "80:80"
      - "3000:3000"
      - "8081:8081"
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - app_logs:/var/log/supervisor

volumes:
  postgres_data:
    driver: local
  app_logs:
    driver: local
EOF

# Create deployment script for VPS
echo "📜 Creating VPS deployment script..."
cat > deployment-production/deploy-on-vps.sh << 'EOF'
#!/bin/bash

echo "🚀 Starting deployment on VPS..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt-get update -y

# Install Docker if not present
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose if not present
echo "🔧 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
sudo docker-compose down || true

# Remove old images to free space
echo "🧹 Cleaning up old Docker images..."
sudo docker system prune -f || true

# Build and start the application
echo "🏗️  Building and starting the application..."
sudo docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 60

# Check service status
echo "🔍 Checking service status..."
sudo docker-compose ps

# Test endpoints
echo "🧪 Testing application endpoints..."
sleep 10

# Test health endpoint
if curl -f http://localhost/health; then
    echo "✅ Health endpoint is working"
else
    echo "❌ Health endpoint failed"
fi

# Test WebSocket server
if curl -f http://localhost:8081/tools; then
    echo "✅ WebSocket server is working"
else
    echo "❌ WebSocket server failed"
fi

# Test web application
if curl -f http://localhost:3000; then
    echo "✅ Web application is working"
else
    echo "❌ Web application failed"
fi

echo "🎉 Deployment completed!"
echo "📱 Your application is available at:"
echo "   - Main Interface: http://$(curl -s ifconfig.me)"
echo "   - WebSocket Server: http://$(curl -s ifconfig.me):8081"
echo "   - Tools Endpoint: http://$(curl -s ifconfig.me):8081/tools"
echo "   - Health Check: http://$(curl -s ifconfig.me)/health"

# Show logs
echo "📋 Recent logs:"
sudo docker-compose logs --tail=20
EOF

chmod +x deployment-production/deploy-on-vps.sh

echo "📤 Uploading files to VPS..."

# Upload files to VPS
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r deployment-production/* $VPS_USER@$VPS_HOST:/home/$VPS_USER/openai-realtime-production/

echo "🔧 Running deployment on VPS..."

# Run deployment commands on VPS
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST << 'EOF'
cd /home/debian/openai-realtime-production

echo "🚀 Starting VPS deployment process..."
chmod +x deploy-on-vps.sh
./deploy-on-vps.sh
EOF

echo "🎉 Webhook Deployment completed!"
echo "=================================="
echo "📱 Your application is now running at:"
echo "   - Main Interface: http://$VPS_HOST"
echo "   - WebSocket Server: http://$VPS_HOST:8081"
echo "   - Tools Endpoint: http://$VPS_HOST:8081/tools"
echo "   - Health Check: http://$VPS_HOST/health"

# Cleanup
rm -rf deployment-production
rm -rf temp-repo

echo "🧹 Cleanup completed"
