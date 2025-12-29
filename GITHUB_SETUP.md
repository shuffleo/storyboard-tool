# GitHub Setup Guide for Cursor

This guide will help you set up GitHub integration in Cursor for this project.

## Prerequisites

1. **GitHub Account**: Make sure you have a GitHub account
2. **Git Installed**: Check if git is installed:
   ```bash
   git --version
   ```
   If not installed, install it: https://git-scm.com/downloads

## Step 1: Initialize Git Repository (if not already done)

1. Open Terminal in Cursor (`` Ctrl+` `` or `View → Terminal`)
2. Navigate to your project directory (if not already there):
   ```bash
   cd /Users/shuffleo/Desktop/storyboard
   ```
3. Check if git is already initialized:
   ```bash
   git status
   ```
   - If you see "not a git repository", continue to step 4
   - If you see file listings, git is already initialized, skip to Step 2

4. Initialize git repository:
   ```bash
   git init
   ```

## Step 2: Create .gitignore File

Create a `.gitignore` file to exclude unnecessary files:

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Build outputs
dist/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local

# Test
coverage/
.nyc_output/
EOF
```

Or create it manually in Cursor and paste the content above.

## Step 3: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `storyboard` (or your preferred name)
3. Description: "Local-first animation pre-production tool"
4. Choose **Public** or **Private**
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **Create repository**

## Step 4: Connect Local Repository to GitHub

After creating the GitHub repository, GitHub will show you commands. Use these:

1. **Add all files to git**:
   ```bash
   git add .
   ```

2. **Create initial commit**:
   ```bash
   git commit -m "Initial commit: Storyboard animation pre-production tool"
   ```

3. **Rename branch to main** (if needed):
   ```bash
   git branch -M main
   ```

4. **Add remote repository** (replace `YOUR_USERNAME` with your GitHub username):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/storyboard.git
   ```

5. **Push to GitHub**:
   ```bash
   git push -u origin main
   ```

   You'll be prompted for your GitHub username and password/token.

## Step 5: GitHub Authentication

If you get authentication errors, you need a Personal Access Token:

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click **Generate new token (classic)**
3. Give it a name: "Cursor Storyboard"
4. Select scopes: **repo** (full control of private repositories)
5. Click **Generate token**
6. **Copy the token** (you won't see it again!)
7. Use this token as your password when pushing

## Step 6: Using Git in Cursor

### Option A: Using Cursor's Built-in Git UI

1. **Source Control Panel**: Click the Git icon in the left sidebar (or `Ctrl+Shift+G`)
2. **Stage Changes**: Click the `+` next to files you want to commit
3. **Commit**: Type a message and click the checkmark
4. **Push**: Click the `...` menu → Push

### Option B: Using Terminal in Cursor

1. Open Terminal (`Ctrl+` ` or `View → Terminal`)
2. Use standard git commands:
   ```bash
   git status                    # See what changed
   git add .                    # Stage all changes
   git commit -m "Your message" # Commit
   git push                      # Push to GitHub
   ```

## Step 7: Daily Workflow

### Making Changes

1. **Make your code changes** in Cursor
2. **Stage changes**:
   ```bash
   git add .
   ```
   Or use Cursor's Source Control panel

3. **Commit**:
   ```bash
   git commit -m "Description of changes"
   ```

4. **Push to GitHub**:
   ```bash
   git push
   ```

### Pulling Changes (if working on multiple machines)

```bash
git pull
```

## Step 8: View Your Repository

After pushing, visit:
```
https://github.com/YOUR_USERNAME/storyboard
```

## Troubleshooting

### "Permission denied" error
- Use Personal Access Token instead of password
- See Step 5 above

### "Repository not found" error
- Check the repository URL is correct
- Make sure the repository exists on GitHub
- Verify your GitHub username

### "Already up to date" when you have changes
- Make sure you've committed your changes first
- Check `git status` to see uncommitted changes

### Want to start fresh?
```bash
rm -rf .git
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/storyboard.git
git push -u origin main
```

## Useful Git Commands

```bash
git status              # See what changed
git log                 # See commit history
git diff                # See changes in detail
git pull                # Get latest from GitHub
git push                # Send changes to GitHub
git branch              # List branches
git checkout -b new-branch  # Create new branch
```

## Next Steps

- Add a README.md with project description
- Consider adding a LICENSE file
- Set up GitHub Actions for CI/CD (optional)
- Add collaborators (Settings → Collaborators)

## Need Help?

- GitHub Docs: https://docs.github.com
- Git Documentation: https://git-scm.com/doc
- Cursor Git Integration: Use the Source Control panel in the sidebar

