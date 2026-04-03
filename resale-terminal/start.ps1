Set-Location $PSScriptRoot

# Install dependencies if needed
if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
}

# Create .env from example if it doesn't exist
if (-Not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "----------------------------------------------" -ForegroundColor Yellow
    Write-Host "  ACTION NEEDED: Open .env and add your keys" -ForegroundColor Yellow
    Write-Host "----------------------------------------------" -ForegroundColor Yellow
    Write-Host "  ANTHROPIC_API_KEY=..." -ForegroundColor White
    Write-Host "  SEATGEEK_CLIENT_ID=..." -ForegroundColor White
    Write-Host "  TICKETMASTER_API_KEY=..." -ForegroundColor White
    Write-Host "----------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
    notepad .env
    Read-Host "Press Enter after you've saved your keys in Notepad"
}

Write-Host ""
Write-Host "Starting Resale Terminal..." -ForegroundColor Green
Write-Host "Open http://localhost:5173 in Chrome or Edge" -ForegroundColor Cyan
Write-Host ""
npm run dev
