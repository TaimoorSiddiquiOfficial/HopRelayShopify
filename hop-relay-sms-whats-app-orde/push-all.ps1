# PowerShell script to push to both GitLab and GitHub
# Usage: .\push-all.ps1 "commit message"

param(
    [Parameter(Mandatory=$false)]
    [string]$Message = "Update code"
)

Write-Host "🚀 Pushing to GitLab and GitHub..." -ForegroundColor Cyan

# Get current branch
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "📍 Current branch: $currentBranch" -ForegroundColor Yellow

# Add all changes
Write-Host "`n📦 Staging changes..." -ForegroundColor Green
git add .

# Check if there are changes to commit
$status = git status --porcelain
if ($status) {
    # Commit changes
    Write-Host "💾 Committing: $Message" -ForegroundColor Green
    git commit -m "$Message"
} else {
    Write-Host "✅ No changes to commit" -ForegroundColor Yellow
}

# Push to GitLab (origin)
Write-Host "`n📤 Pushing to GitLab (origin)..." -ForegroundColor Magenta
git push origin $currentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ GitLab push successful!" -ForegroundColor Green
} else {
    Write-Host "❌ GitLab push failed!" -ForegroundColor Red
    exit 1
}

# Push to GitHub
Write-Host "`n📤 Pushing to GitHub..." -ForegroundColor Magenta
git push github $currentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ GitHub push successful!" -ForegroundColor Green
} else {
    Write-Host "❌ GitHub push failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 Successfully pushed to both GitLab and GitHub!" -ForegroundColor Cyan
Write-Host "📊 View your repositories:" -ForegroundColor Yellow
Write-Host "   GitLab: https://gitlab.com/taimoorrehman.sid/hoprelay" -ForegroundColor Blue
Write-Host "   GitHub: https://github.com/TaimoorSiddiquiOfficial/HopRelayShopify" -ForegroundColor Blue
