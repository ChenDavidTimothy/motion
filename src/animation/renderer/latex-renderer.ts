// src/animation/renderer/latex-renderer.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ParsedLatex, ParsedGlyph, ParsedTextElement, ParsedPathElement, NodeCanvasContext } from '../types';

const execAsync = promisify(exec);

export async function latexToSvg(equation: string): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `latex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    const cleanEquation = equation
      .replace(/^\\\[/, '')
      .replace(/\\\]$/, '')
      .replace(/^\\\(/, '')
      .replace(/\\\)$/, '')
      .replace(/^\$\$/, '')
      .replace(/\$\$$/, '')
      .replace(/^\$/, '')
      .replace(/\$$/, '')
      .trim();
    
    const latexContent = `\\documentclass[preview,border=2pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}
\\usepackage{mathtools}
\\usepackage{microtype}
\\DisableLigatures{encoding = *, family = *}
\\begin{document}
$\\displaystyle ${cleanEquation}$
\\end{document}`;
    
    fs.writeFileSync(path.join(tempDir, 'eq.tex'), latexContent);
    
    await execAsync('latex -interaction=nonstopmode eq.tex', { 
      cwd: tempDir,
      timeout: 30000
    });
    
    await execAsync('dvisvgm eq.dvi -o eq.svg', { 
      cwd: tempDir,
      timeout: 30000
    });
    
    const svgPath = path.join(tempDir, 'eq.svg');
    if (!fs.existsSync(svgPath)) {
      throw new Error('SVG file was not generated');
    }
    
    return fs.readFileSync(svgPath, 'utf8');
  } finally {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        console.warn(`Failed to clean up temp directory: ${tempDir}`);
      }
    }
  }
}

function parseAttribute<T = string>(
  tag: string, 
  attribute: string, 
  parser?: (value: string) => T
): T | undefined {
  const match = new RegExp(`${attribute}=['"]([^'"]*)['"]|${attribute}=([^\\s>]*)`).exec(tag);
  const value = match?.[1] ?? match?.[2];
  
  if (value === undefined) return undefined;
  if (!parser) return value as T;
  
  const parsed = parser(value);
  return parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined;
}

export function parseSVGContent(svgContent: string): ParsedLatex {
  console.log('=== GLYPH PARSING START ===');
  
  const glyphs = new Map<string, ParsedGlyph>();
  
  // Parse ALL glyphs from SVG fonts
  try {
    const allGlyphMatches = [...svgContent.matchAll(/<glyph[^>]*>/gs)];
    console.log(`Found ${allGlyphMatches.length} total glyph tags in SVG`);
    
    for (let i = 0; i < allGlyphMatches.length; i++) {
      const match = allGlyphMatches[i];
      const tag = match[0];
      const unicode = parseAttribute(tag, 'unicode');
      const glyphName = parseAttribute(tag, 'glyph-name');
      const width = parseAttribute(tag, 'horiz-adv-x', parseFloat) ?? 500;
      const pathData = parseAttribute(tag, 'd');
      
      console.log(`Glyph ${i}: name="${glyphName}" unicode="${unicode || 'none'}" hasPath=${!!pathData}`);
      
      if (pathData) {
        if (unicode) {
          glyphs.set(unicode, { width, path: pathData });
          console.log(`  -> Added by unicode: "${unicode}"`);
        }
        if (glyphName) {
          glyphs.set(glyphName, { width, path: pathData });
          console.log(`  -> Added by name: "${glyphName}"`);
        }
      } else {
        console.log(`  -> SKIPPED (no path data)`);
      }
    }
    
    console.log(`=== GLYPH PARSING COMPLETE: ${glyphs.size} glyphs in map ===`);
  } catch (error) {
    console.error('Glyph parsing error:', error);
  }
  
  // Parse text elements with mixed base text + tspan support
  const textElements: ParsedTextElement[] = [];
  try {
    for (const match of svgContent.matchAll(/<text[^>]*>.*?<\/text>/gs)) {
      const textTag = match[0];
      const baseX = parseAttribute(textTag, 'x', parseFloat) ?? 0;
      const baseY = parseAttribute(textTag, 'y', parseFloat) ?? 0;
      
      // Extract base text content (everything not in tspan)
      let baseContent = textTag
        .replace(/<text[^>]*>/, '')
        .replace(/<\/text>/, '')
        .replace(/<tspan[^>]*>.*?<\/tspan>/g, '')
        .trim();
      
      // Add base text if it exists
      if (baseContent) {
        textElements.push({ x: baseX, y: baseY, content: baseContent });
      }
      
      // Extract tspan elements with individual positioning
      const tspanMatches = [...textTag.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)];
      
      for (const tspanMatch of tspanMatches) {
        const tspanTag = tspanMatch[0];
        const char = tspanMatch[1]?.trim();
        if (char) {
          const x = parseAttribute(tspanTag, 'x', parseFloat) ?? baseX;
          const y = parseAttribute(tspanTag, 'y', parseFloat) ?? baseY;
          textElements.push({ x, y, content: char });
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing text elements:', error);
  }
  
  // Parse path elements
  const pathElements: ParsedPathElement[] = [];
  try {
    for (const match of svgContent.matchAll(/<path[^>]*\/?>|<path[^>]*>.*?<\/path>/gs)) {
      const tag = match[0];
      const d = parseAttribute(tag, 'd');
      if (d) {
        pathElements.push({
          d,
          stroke: parseAttribute(tag, 'stroke'),
          strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
          fill: parseAttribute(tag, 'fill'),
          transform: parseAttribute(tag, 'transform')
        });
      }
    }
  } catch (error) {
    console.warn('Error parsing path elements:', error);
  }
  
  // Parse line elements
  const lineElements = [];
  try {
    for (const match of svgContent.matchAll(/<line[^>]*\/?>|<line[^>]*>.*?<\/line>/gs)) {
      const tag = match[0];
      lineElements.push({
        x1: parseAttribute(tag, 'x1', parseFloat) ?? 0,
        y1: parseAttribute(tag, 'y1', parseFloat) ?? 0,
        x2: parseAttribute(tag, 'x2', parseFloat) ?? 0,
        y2: parseAttribute(tag, 'y2', parseFloat) ?? 0,
        stroke: parseAttribute(tag, 'stroke'),
        strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
        transform: parseAttribute(tag, 'transform')
      });
    }
  } catch (error) {
    console.warn('Error parsing line elements:', error);
  }
  
  // Parse rect elements
  const rectElements = [];
  try {
    for (const match of svgContent.matchAll(/<rect[^>]*\/?>|<rect[^>]*>.*?<\/rect>/gs)) {
      const tag = match[0];
      rectElements.push({
        x: parseAttribute(tag, 'x', parseFloat) ?? 0,
        y: parseAttribute(tag, 'y', parseFloat) ?? 0,
        width: parseAttribute(tag, 'width', parseFloat) ?? 0,
        height: parseAttribute(tag, 'height', parseFloat) ?? 0,
        fill: parseAttribute(tag, 'fill'),
        stroke: parseAttribute(tag, 'stroke'),
        strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
        transform: parseAttribute(tag, 'transform')
      });
    }
  } catch (error) {
    console.warn('Error parsing rect elements:', error);
  }
  
  return { glyphs, textElements, pathElements, lineElements, rectElements };
}

function applyTransform(ctx: NodeCanvasContext | CanvasRenderingContext2D, transform?: string): void {
  if (!transform) return;
  
  const translateMatch = /translate\(([^,]+),([^)]+)\)/.exec(transform);
  if (translateMatch?.[1] && translateMatch?.[2]) {
    ctx.translate(parseFloat(translateMatch[1]), parseFloat(translateMatch[2]));
  }
  
  const scaleMatch = /scale\(([^,]+)(?:,([^)]+))?\)/.exec(transform);
  if (scaleMatch?.[1]) {
    const sx = parseFloat(scaleMatch[1]);
    const sy = scaleMatch[2] ? parseFloat(scaleMatch[2]) : sx;
    ctx.scale(sx, sy);
  }
  
  const rotateMatch = /rotate\(([^)]+)\)/.exec(transform);
  if (rotateMatch?.[1]) {
    ctx.rotate(parseFloat(rotateMatch[1]) * Math.PI / 180);
  }
}

export function renderSVGPath(ctx: NodeCanvasContext | CanvasRenderingContext2D, pathData: string): void {
  if (!pathData) return;
  
  const commands = pathData.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? [];
  
  ctx.beginPath();
  let currentX = 0, currentY = 0, startX = 0, startY = 0, lastControlX = 0, lastControlY = 0;
  
  for (const command of commands) {
    if (!command) continue;

    const type = command[0]!;
    const isRelative = type === type.toLowerCase();
    const coords = [...command.slice(1).trim().matchAll(/-?\d*\.?\d+/g)].map(m => parseFloat(m[0]));
    
    switch (type.toUpperCase()) {
      case 'M':
        if (coords.length >= 2) {
          currentX = isRelative ? currentX + coords[0]! : coords[0]!;
          currentY = isRelative ? currentY + coords[1]! : coords[1]!;
          startX = currentX; startY = currentY;
          ctx.moveTo(currentX, currentY);
        }
        break;
      case 'L':
        if (coords.length >= 2) {
          currentX = isRelative ? currentX + coords[0]! : coords[0]!;
          currentY = isRelative ? currentY + coords[1]! : coords[1]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      case 'H':
        if (coords.length >= 1) {
          currentX = isRelative ? currentX + coords[0]! : coords[0]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      case 'V':
        if (coords.length >= 1) {
          currentY = isRelative ? currentY + coords[0]! : coords[0]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      case 'C':
        if (coords.length >= 6) {
          const cp1x = isRelative ? currentX + coords[0]! : coords[0]!;
          const cp1y = isRelative ? currentY + coords[1]! : coords[1]!;
          const cp2x = isRelative ? currentX + coords[2]! : coords[2]!;
          const cp2y = isRelative ? currentY + coords[3]! : coords[3]!;
          currentX = isRelative ? currentX + coords[4]! : coords[4]!;
          currentY = isRelative ? currentY + coords[5]! : coords[5]!;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, currentX, currentY);
          lastControlX = cp2x; lastControlY = cp2y;
        }
        break;
      case 'S':
        if (coords.length >= 4) {
          const scp1x = 2 * currentX - lastControlX;
          const scp1y = 2 * currentY - lastControlY;
          const scp2x = isRelative ? currentX + coords[0]! : coords[0]!;
          const scp2y = isRelative ? currentY + coords[1]! : coords[1]!;
          currentX = isRelative ? currentX + coords[2]! : coords[2]!;
          currentY = isRelative ? currentY + coords[3]! : coords[3]!;
          ctx.bezierCurveTo(scp1x, scp1y, scp2x, scp2y, currentX, currentY);
          lastControlX = scp2x; lastControlY = scp2y;
        }
        break;
      case 'Q':
        if (coords.length >= 4) {
          const qcp1x = isRelative ? currentX + coords[0]! : coords[0]!;
          const qcp1y = isRelative ? currentY + coords[1]! : coords[1]!;
          currentX = isRelative ? currentX + coords[2]! : coords[2]!;
          currentY = isRelative ? currentY + coords[3]! : coords[3]!;
          ctx.quadraticCurveTo(qcp1x, qcp1y, currentX, currentY);
          lastControlX = qcp1x; lastControlY = qcp1y;
        }
        break;
      case 'T':
        if (coords.length >= 2) {
          const tcp1x = 2 * currentX - lastControlX;
          const tcp1y = 2 * currentY - lastControlY;
          currentX = isRelative ? currentX + coords[0]! : coords[0]!;
          currentY = isRelative ? currentY + coords[1]! : coords[1]!;
          ctx.quadraticCurveTo(tcp1x, tcp1y, currentX, currentY);
          lastControlX = tcp1x; lastControlY = tcp1y;
        }
        break;
      case 'Z':
        ctx.lineTo(startX, startY);
        ctx.closePath();
        currentX = startX; currentY = startY;
        break;
    }
  }
}

// Native SVG positioning - no artificial modifications
export function renderLatex(
  ctx: NodeCanvasContext | CanvasRenderingContext2D, 
  latexData: ParsedLatex, 
  x: number, 
  y: number, 
  scale = 1
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  // Render paths at ORIGINAL SVG coordinates
  for (const pathElement of latexData.pathElements) {
    ctx.save();
    applyTransform(ctx, pathElement.transform);
    renderSVGPath(ctx, pathElement.d);
    
    if (pathElement.fill && pathElement.fill !== 'none') {
      ctx.fillStyle = pathElement.fill;
      ctx.fill();
    }
    
    if (pathElement.stroke && pathElement.stroke !== 'none') {
      ctx.strokeStyle = pathElement.stroke;
      ctx.lineWidth = pathElement.strokeWidth ?? 1;
      ctx.stroke();
    } else if (!pathElement.fill || pathElement.fill === 'none') {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Render lines at ORIGINAL SVG coordinates
  for (const lineElement of latexData.lineElements) {
    ctx.save();
    applyTransform(ctx, lineElement.transform);
    ctx.beginPath();
    ctx.moveTo(lineElement.x1, lineElement.y1);
    ctx.lineTo(lineElement.x2, lineElement.y2);
    
    ctx.strokeStyle = lineElement.stroke ?? '#ffffff';
    ctx.lineWidth = lineElement.strokeWidth ?? 1;
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Render rectangles at ORIGINAL SVG coordinates
  for (const rectElement of latexData.rectElements) {
    ctx.save();
    applyTransform(ctx, rectElement.transform);
    
    if (rectElement.fill && rectElement.fill !== 'none') {
      ctx.fillStyle = rectElement.fill;
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    if (rectElement.stroke && rectElement.stroke !== 'none') {
      ctx.strokeStyle = rectElement.stroke;
      ctx.lineWidth = rectElement.strokeWidth ?? 1;
      ctx.strokeRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    } else if (!rectElement.fill || rectElement.fill === 'none') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    ctx.restore();
  }
  
  // Render text at EXACT SVG coordinates
  for (const textElement of latexData.textElements) {
    if (textElement.content.length === 1) {
      // Single character with exact position
      const char = textElement.content;
      const glyph = latexData.glyphs.get(char);
      
      ctx.save();
      ctx.translate(textElement.x, textElement.y);
      ctx.scale(0.01, -0.01);
      
      if (glyph?.path) {
        renderSVGPath(ctx, glyph.path);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        // Fallback for missing glyphs
        ctx.scale(100, -100);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px serif';
        ctx.fillText(char, 0, 0);
      }
      
      ctx.restore();
    } else if (textElement.content.length > 1) {
      // Multi-character text
      ctx.save();
      ctx.translate(textElement.x, textElement.y);
      ctx.scale(0.01, -0.01);
      
      let charOffset = 0;
      for (const char of textElement.content) {
        const glyph = latexData.glyphs.get(char);
        if (glyph?.path) {
          ctx.save();
          ctx.translate(charOffset, 0);
          renderSVGPath(ctx, glyph.path);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
          charOffset += glyph.width;
        } else {
          ctx.save();
          ctx.translate(charOffset, 0);
          ctx.scale(100, -100);
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px serif';
          ctx.fillText(char, 0, 0);
          ctx.restore();
          charOffset += 600;
        }
      }
      
      ctx.restore();
    }
    // Empty text elements are now simply skipped
  }
  
  ctx.restore();
}