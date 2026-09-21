#!/usr/bin/env bash
set -e

# dims-extract - Zero-Permission User-space Installer
# Installs directly into ~/.local/bin without sudo or EACCES errors.

echo "[dims-extract] Installing dims-extract..."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not installed. Please install Node.js (v18+) first."
  exit 1
fi

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

LAUNCHER="$BIN_DIR/dims"

cat << 'EOF' > "$LAUNCHER"
#!/usr/bin/env bash
exec npx -y dims-extract "$@"
EOF

chmod +x "$LAUNCHER"
cp -f "$LAUNCHER" "$BIN_DIR/dims-extract"

# Ensure ~/.local/bin is in PATH in shell rc files
SHELL_NAME=$(basename "$SHELL")
RC_FILE=""

if [ "$SHELL_NAME" = "zsh" ]; then
  RC_FILE="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
  if [ -f "$HOME/.bashrc" ]; then
    RC_FILE="$HOME/.bashrc"
  elif [ -f "$HOME/.bash_profile" ]; then
    RC_FILE="$HOME/.bash_profile"
  fi
fi

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  if [ -n "$RC_FILE" ]; then
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$RC_FILE"
    echo "[dims-extract] Added ~/.local/bin to PATH in $RC_FILE"
  fi
  export PATH="$BIN_DIR:$PATH"
fi

echo ""
echo "🎉 dims installed successfully into $BIN_DIR!"
echo "You can now run:"
echo "  dims --help"
echo "  (or: dims-extract --help)"
echo ""
