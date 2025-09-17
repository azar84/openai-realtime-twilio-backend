# OpenAI Realtime Twilio Backend

Backend services for the OpenAI Realtime Twilio integration, including WebSocket server and webhook server.

## Architecture

This backend consists of two main services:

1. **WebSocket Server** (`websocket-server/`) - Handles real-time communication with OpenAI's Realtime API and Twilio voice calls
2. **Webhook Server** (`webhook-server.js`) - Handles Twilio webhook events for call management

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Twilio account with phone number
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd openai-realtime-twilio-backend
```

2. Install dependencies:
```bash
npm run install-all
```

3. Set up environment variables:
```bash
./setup-env.sh
```

4. Configure your `.env` files in both `websocket-server/` and root directory.

### Running the Services

#### Development Mode
```bash
# Start WebSocket server in development mode
npm run dev

# In another terminal, start webhook server
npm run start-webhook
```

#### Production Mode
```bash
# Build and start WebSocket server
npm run build
npm start

# In another terminal, start webhook server
npm run start-webhook
```

#### Deploy Webhook Server
```bash
npm run deploy-webhook
```

## Project Structure

```
├── websocket-server/          # Main WebSocket server
│   ├── src/                  # TypeScript source files
│   ├── dist/                 # Compiled JavaScript files
│   └── package.json          # WebSocket server dependencies
├── database/                 # Database schema and migrations
├── webhook-server.js         # Twilio webhook server
├── webhook-server-package.json # Webhook server dependencies
├── webhook-deploy.sh         # Webhook deployment script
├── setup-env.sh             # Environment setup script
└── package.json             # Root dependencies and scripts
```

## Environment Variables

### WebSocket Server (.env in websocket-server/)
- `OPENAI_API_KEY` - Your OpenAI API key
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token
- `TWILIO_PHONE_NUMBER` - Your Twilio phone number
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - WebSocket server port (default: 8080)

### Webhook Server (.env in root)
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token
- `WEBHOOK_URL` - Public URL for webhook server

## Database

The database schema and migrations are located in the `database/` directory. Make sure your PostgreSQL database is running and accessible via the `DATABASE_URL` environment variable.

## API Endpoints

### WebSocket Server
- `ws://localhost:8080` - WebSocket connection for real-time communication

### Webhook Server
- `POST /webhook` - Twilio webhook endpoint for call events

## Development

### Building
```bash
npm run build
```

### Running Tests
```bash
# Tests will be added in future versions
```

## Deployment

See the deployment guides in the main repository documentation for production deployment instructions.

## License

MIT License - see LICENSE file for details.
