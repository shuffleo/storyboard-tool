# Git Setup Guide - Connecting to GitHub Repository

This guide will help you configure git on your device and connect to the storyboard-tool repository.

## Step 1: Check Current Git Configuration

First, let's check if git is already configured:

```bash
git config --global user.name
git config --global user.email
```

If these return empty, you need to configure them.

## Step 2: Configure Git Identity

You need to set your name and email. You can do this either:

### Option A: Global Configuration (Recommended)
This sets your identity for all git repositories on your machine:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

**Important**: Use the email associated with your GitHub account for best results.

### Option B: Repository-Specific Configuration
If you only want to set it for this repository:

```bash
cd /Users/shuffleo/Github/storyboard-tool
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

## Step 3: Verify Git Configuration

Check that your configuration was set correctly:

```bash
git config --list | grep user
```

You should see:
```
user.name=Your Name
user.email=your-email@example.com
```

## Step 4: Check GitHub Authentication

### Option A: Using HTTPS (Recommended for beginners)

1. **Check if you're already authenticated:**
   ```bash
   git ls-remote https://github.com/shuffleo/storyboard-tool.git
   ```

2. **If you get a password prompt**, you'll need to use a Personal Access Token:
   - Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name like "storyboard-tool"
   - Select scopes: `repo` (full control of private repositories)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

3. **When pushing, use the token as your password:**
   ```bash
   git push origin main
   # Username: shuffleo
   # Password: [paste your personal access token]
   ```

### Option B: Using SSH (More secure, one-time setup)

1. **Check if you have SSH keys:**
   ```bash
   ls -al ~/.ssh
   ```

2. **If you don't have SSH keys, generate them:**
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   # Press Enter to accept default file location
   # Optionally set a passphrase (recommended)
   ```

3. **Add SSH key to ssh-agent:**
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```

4. **Copy your public key:**
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the entire output
   ```

5. **Add SSH key to GitHub:**
   - Go to GitHub.com → Settings → SSH and GPG keys
   - Click "New SSH key"
   - Title: "MacBook Pro" (or your device name)
   - Key: Paste your public key
   - Click "Add SSH key"

6. **Test SSH connection:**
   ```bash
   ssh -T git@github.com
   # You should see: "Hi shuffleo! You've successfully authenticated..."
   ```

7. **Change remote URL to SSH:**
   ```bash
   cd /Users/shuffleo/Github/storyboard-tool
   git remote set-url origin git@github.com:shuffleo/storyboard-tool.git
   ```

## Step 5: Verify Repository Connection

Check your remote repository URL:

```bash
git remote -v
```

You should see:
```
origin  https://github.com/shuffleo/storyboard-tool.git (fetch)
origin  https://github.com/shuffleo/storyboard-tool.git (push)
```

Or if using SSH:
```
origin  git@github.com:shuffleo/storyboard-tool.git (fetch)
origin  git@github.com:shuffleo/storyboard-tool.git (push)
```

## Step 6: Check Current Status

See what changes are ready to commit:

```bash
git status
```

## Step 7: Commit Changes (if not already committed)

If changes aren't committed yet:

```bash
# Add all changes
git add -A

# Commit with a message
git commit -m "Add Google Drive integration, auto-resizing textareas, delete dialog, and UI improvements

- Added Google Drive backend support with OAuth 2.0
- Implemented auto-resizing textareas for Script and General Notes
- Replaced browser prompt with React modal for delete shot/scene dialog
- Changed compact mode toggle from checkbox to text button
- Fixed undo/redo history management
- Default projects now start with 3 scenes and 5 shots each
- New scenes automatically get at least one shot
- Improved PDF export to prevent image distortion
- Updated TopBar with three-dot menu and icon-only undo/redo buttons
- Updated documentation to reflect all changes"
```

## Step 8: Push to GitHub

Push your changes to the repository:

```bash
git push origin main
```

**If using HTTPS and prompted for credentials:**
- Username: `shuffleo`
- Password: [Your Personal Access Token, not your GitHub password]

**If using SSH:**
- Should work automatically if SSH key is set up correctly

## Step 9: Verify Push Success

Check that your push was successful:

```bash
git log --oneline -5
```

You should see your latest commit at the top.

## Troubleshooting

### Issue: "Permission denied (publickey)"
**Solution**: Set up SSH keys (see Step 4, Option B) or use HTTPS with Personal Access Token.

### Issue: "fatal: could not read Username"
**Solution**: Use a Personal Access Token instead of your password when using HTTPS.

### Issue: "error setting certificate verify locations"
**Solution**: This is usually a network/SSL issue. Try:
```bash
git config --global http.sslVerify true
# Or if that doesn't work:
git config --global http.sslVerify false  # Less secure, but may work
```

### Issue: "Updates were rejected because the remote contains work"
**Solution**: Someone else pushed changes. Pull first:
```bash
git pull origin main
# Resolve any conflicts if they occur
git push origin main
```

## Quick Reference Commands

```bash
# Check git config
git config --list

# Set identity (global)
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"

# Check remote
git remote -v

# Check status
git status

# Add and commit
git add -A
git commit -m "Your commit message"

# Push
git push origin main

# Pull latest changes
git pull origin main
```

## Need Help?

If you encounter any issues:
1. Check the error message carefully
2. Make sure you're in the correct directory: `/Users/shuffleo/Github/storyboard-tool`
3. Verify your GitHub account has access to the repository
4. Ensure your Personal Access Token has `repo` scope (if using HTTPS)

