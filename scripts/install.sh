#!/usr/bin/env bash
# Instala skills de Synera sin el sistema de plugins, copiándolas a ~/.claude/skills/
# Uso: ./install.sh [skill1 skill2 ...]   (sin args = todas)
set -euo pipefail
REPO="synera/synera-skills"
DEST="${HOME}/.claude/skills"
ALL=(afip-arca meta-n8n-whatsapp n8n-production-patterns mercadopago correo-argentino)
SKILLS=("${@:-${ALL[@]}}")
mkdir -p "$DEST"
for s in "${SKILLS[@]}"; do
  echo "→ instalando $s"
  npx --yes degit "${REPO}/plugins/${s}/skills/${s}" "${DEST}/${s}" --force
done
echo "Listo. Skills en ${DEST}"
