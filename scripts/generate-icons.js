#!/usr/bin/env node
// Generates PNG icons using Canvas API (requires: npm install canvas)
// Run: node scripts/generate-icons.js

const { createCanvas } = require('canvas');
const { writeFileSync } = require('fs');
const { join } = require('path');

const SIZES = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Background circle: red gradient
  const grad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, cy, r);
  grad.addColorStop(0, '#e74c3c');
  grad.addColorStop(1, '#c0392b');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // White shield
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const sw = size * 0.55;
  const sh = size * 0.65;
  const sx = cx - sw / 2;
  const sy = cy - sh / 2 - size * 0.03;
  ctx.beginPath();
  ctx.moveTo(sx + sw / 2, sy);
  ctx.lineTo(sx + sw, sy + sh * 0.35);
  ctx.quadraticCurveTo(sx + sw, sy + sh * 0.75, sx + sw / 2, sy + sh);
  ctx.quadraticCurveTo(sx, sy + sh * 0.75, sx, sy + sh * 0.35);
  ctx.closePath();
  ctx.fill();

  // "F" letter
  if (size >= 32) {
    ctx.fillStyle = '#c0392b';
    ctx.font = `bold ${Math.round(size * 0.32)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', cx, cy + size * 0.02);
  }

  return canvas.toBuffer('image/png');
}

SIZES.forEach(size => {
  const buf = drawIcon(size);
  const outPath = join(__dirname, '..', 'icons', `icon${size}.png`);
  writeFileSync(outPath, buf);
  console.log(`icon${size}.png written`);
});
