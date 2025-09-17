#!/bin/bash

# Environment Setup Script for VPS Deployment
# This script helps you set up the required environment variables

echo "🔧 OpenAI Realtime + Twilio Demo - Environment Setup"
echo "===================================================="
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "📋 Found existing .env file. Loading variables..."
    source .env
else
    echo "📝 No .env file found. Please provide the following information:"
fi

echo ""
echo "Please provide your API keys and configuration:"
echo ""

# OpenAI API Key
if [ -z "$OPENAI_API_KEY" ]; then
    read -p "🔑 Enter your OpenAI API Key: " OPENAI_API_KEY
    export OPENAI_API_KEY
fi

# Twilio Account SID
if [ -z "$TWILIO_ACCOUNT_SID" ]; then
    read -p "📞 Enter your Twilio Account SID: " TWILIO_ACCOUNT_SID
    export TWILIO_ACCOUNT_SID
fi

# Twilio Auth Token
if [ -z "$TWILIO_AUTH_TOKEN" ]; then
    read -p "🔐 Enter your Twilio Auth Token: " TWILIO_AUTH_TOKEN
    export TWILIO_AUTH_TOKEN
fi

# Twilio Phone Number (optional)
if [ -z "$TWILIO_PHONE_NUMBER" ]; then
    read -p "📱 Enter your Twilio Phone Number (optional): " TWILIO_PHONE_NUMBER
    export TWILIO_PHONE_NUMBER
fi

# N8N Tool URL (optional)
if [ -z "$N8N_TOOL_URL" ]; then
    read -p "🔧 Enter your N8N Tool URL (optional): " N8N_TOOL_URL
    export N8N_TOOL_URL
fi

# N8N Secret (optional)
if [ -z "$N8N_SECRET" ]; then
    read -p "🔒 Enter your N8N Secret (optional): " N8N_SECRET
    export N8N_SECRET
fi

echo ""
echo "✅ Environment variables set:"
echo "   - OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
echo "   - TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID:0:10}..."
echo "   - TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN:0:10}..."
echo "   - TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER:-Not set}"
echo "   - N8N_TOOL_URL: ${N8N_TOOL_URL:-Not set}"
echo "   - N8N_SECRET: ${N8N_SECRET:-Not set}"
echo ""

# Save to .env file
echo "💾 Saving environment variables to .env file..."
cat > .env << EOF
# OpenAI Realtime API Configuration
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=gpt-4o-realtime-preview-2024-10-01

# Twilio Configuration
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}

# Database Configuration
DB_NAME=openai_realtime_db
DB_USER=postgres
DB_PASSWORD=postgres123

# Server Configuration
NODE_ENV=production
DEBUG=false

# Tool Integration (optional)
N8N_TOOL_URL=${N8N_TOOL_URL}
N8N_SECRET=${N8N_SECRET}

# Audio Configuration
AUDIO_FORMAT=g711_ulaw
EOF

echo "🎉 Environment setup completed!"
echo ""
echo "🚀 Ready to deploy! Run the following command to deploy to your VPS:"
echo "   ./deploy-vps-production.sh"
echo ""
echo "📋 Or if you want to test locally first:"
echo "   docker build -f Dockerfile.production -t openai-realtime-app ."
echo "   docker run -p 80:80 -p 3000:3000 -p 8081:8081 -p 5432:5432 --env-file .env openai-realtime-app"
