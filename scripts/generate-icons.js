#!/usr/bin/env node
const { createCanvas } = require('canvas');
const { writeFileSync } = require('fs');
const { join } = require('path');

const SIZES = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2;

  // Dark navy background
  const bg = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, r);
  bg.addColorStop(0, '#1e2a4a');
  bg.addColorStop(1, '#0d1526');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Red shield
  const sw = size * 0.60, sh = size * 0.68;
  const sx = cx - sw / 2, sy = cy - sh / 2 - size * 0.02;

  const sg = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  sg.addColorStop(0, '#e74c3c');
  sg.addColorStop(1, '#c0392b');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(cx, sy);
  ctx.lineTo(sx + sw, sy + sh * 0.12);
  ctx.lineTo(sx + sw, sy + sh * 0.55);
  ctx.quadraticCurveTo(sx + sw, sy + sh * 0.85, cx, sy + sh);
  ctx.quadraticCurveTo(sx, sy + sh * 0.85, sx, sy + sh * 0.55);
  ctx.lineTo(sx, sy + sh * 0.12);
  ctx.closePath();
  ctx.fill();

  // Subtle highlight on top edge
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx, sy + size * 0.02);
  ctx.lineTo(sx + sw - size * 0.02, sy + sh * 0.13);
  ctx.stroke();

  // White text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (size >= 48) {
    ctx.font = `bold ${Math.round(size * 0.28)}px Arial, sans-serif`;
    ctx.fillText('FA', cx, cy + size * 0.03);
  } else {
    ctx.font = `bold ${Math.round(size * 0.38)}px Arial, sans-serif`;
    ctx.fillText('F', cx, cy + size * 0.02);
  }

  return canvas.toBuffer('image/png');
}

SIZES.forEach(size => {
  const buf  = drawIcon(size);
  const path = join(__dirname, '..', 'icons', `icon${size}.png`);
  writeFileSync(path, buf);
  console.log(`✓ icon${size}.png`);
});
