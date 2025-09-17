#!/usr/bin/env node

/**
 * GitHub Webhook Server for Automated VPS Deployment
 * This server listens for GitHub webhook events and triggers deployments
 */

const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret-here';

// Middleware
app.use(express.json({ verify: verifySignature }));

// Verify GitHub webhook signature
function verifySignature(req, res, buf, encoding) {
  const signature = req.get('X-Hub-Signature-256');
  if (!signature) {
    throw new Error('No signature provided');
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', SECRET)
    .update(buf, encoding)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }
}

// Deployment function
async function deploy() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting deployment...');
    
    // Set environment variables
    const env = {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
      N8N_TOOL_URL: process.env.N8N_TOOL_URL,
      N8N_SECRET: process.env.N8N_SECRET,
    };

    // Run deployment script
    const deployProcess = exec('./webhook-deploy.sh', { env }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Deployment failed:', error);
        reject(error);
        return;
      }
      
      console.log('✅ Deployment completed successfully');
      console.log('📋 Output:', stdout);
      if (stderr) {
        console.log('⚠️  Warnings:', stderr);
      }
      
      resolve(stdout);
    });

    // Log deployment progress
    deployProcess.stdout.on('data', (data) => {
      console.log('📋 Deployment:', data.toString());
    });

    deployProcess.stderr.on('data', (data) => {
      console.log('⚠️  Deployment warning:', data.toString());
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'github-webhook-deployer'
  });
});

// GitHub webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const event = req.get('X-GitHub-Event');
    const payload = req.body;

    console.log(`📨 Received ${event} event`);

    // Only deploy on push to main/master branch
    if (event === 'push') {
      const branch = payload.ref.replace('refs/heads/', '');
      
      if (branch === 'main' || branch === 'master') {
        console.log(`🚀 Push detected on ${branch} branch, starting deployment...`);
        
        // Respond immediately to GitHub
        res.status(200).json({ 
          message: 'Deployment triggered successfully',
          branch: branch,
          commit: payload.head_commit?.id?.substring(0, 7) || 'unknown'
        });

        // Deploy asynchronously
        deploy()
          .then(() => {
            console.log('🎉 Deployment completed successfully');
          })
          .catch((error) => {
            console.error('❌ Deployment failed:', error);
          });
      } else {
        console.log(`ℹ️  Push to ${branch} branch ignored (only main/master triggers deployment)`);
        res.status(200).json({ 
          message: 'Push ignored - not main/master branch',
          branch: branch
        });
      }
    } else {
      console.log(`ℹ️  ${event} event ignored`);
      res.status(200).json({ 
        message: 'Event ignored',
        event: event
      });
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ 
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

// Manual deployment trigger
app.post('/deploy', async (req, res) => {
  try {
    console.log('🚀 Manual deployment triggered');
    
    res.status(200).json({ 
      message: 'Manual deployment triggered successfully'
    });

    // Deploy asynchronously
    deploy()
      .then(() => {
        console.log('🎉 Manual deployment completed successfully');
      })
      .catch((error) => {
        console.error('❌ Manual deployment failed:', error);
      });
  } catch (error) {
    console.error('❌ Manual deployment error:', error);
    res.status(500).json({ 
      error: 'Manual deployment failed',
      message: error.message
    });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    service: 'GitHub Webhook Deployer',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook',
      deploy: '/deploy',
      health: '/health',
      status: '/status'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GitHub Webhook Server running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔧 Manual deploy: http://localhost:${PORT}/deploy`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});
