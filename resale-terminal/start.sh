#!/bin/bash
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create .env from example if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "----------------------------------------------"
  echo "  ACTION NEEDED: Open .env and add your keys"
  echo "----------------------------------------------"
  echo "  ANTHROPIC_API_KEY=..."
  echo "  SEATGEEK_CLIENT_ID=..."
  echo "  TICKETMASTER_API_KEY=..."
  echo "----------------------------------------------"
  echo ""
  read -p "Press Enter after you've added your keys..."
fi

echo ""
echo "Starting Resale Terminal..."
echo "Open http://localhost:5173 in Chrome or Edge"
echo ""
npm run dev
