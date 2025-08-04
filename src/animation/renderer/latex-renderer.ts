// src/animation/renderer/latex-renderer.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ParsedLatex, ParsedGlyph, ParsedTextElement, ParsedPathElement, NodeCanvasContext } from '../types';

const execAsync = promisify(exec);

// Constants
const DEFAULT_GLYPH_WIDTH = 500;
const GLYPH_SCALE_FACTOR = 0.01;
const FALLBACK_FONT = '12px serif';
const FALLBACK_CHAR_WIDTH = 6;
const DEFAULT_STROKE_WIDTH = 1;

export async function latexToSvg(equation: string): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `latex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Remove outer delimiters only - no character sanitization
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
    
    try {
      await execAsync('latex -interaction=nonstopmode eq.tex', { 
        cwd: tempDir,
        timeout: 30000
      });
    } catch (error: unknown) {
      const logPath = path.join(tempDir, 'eq.log');
      let logContent = '';
      if (fs.existsSync(logPath)) {
        logContent = fs.readFileSync(logPath, 'utf8');
      }
      throw new Error(`LaTeX compilation failed: ${error instanceof Error ? error.message : String(error)}${logContent ? '\nLog: ' + logContent.slice(-500) : ''}`);
    }
    
    try {
      await execAsync('dvisvgm eq.dvi -o eq.svg', { 
        cwd: tempDir,
        timeout: 30000
      });
    } catch (error) {
      throw new Error(`SVG conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    const svgPath = path.join(tempDir, 'eq.svg');
    if (!fs.existsSync(svgPath)) {
      throw new Error('SVG file was not generated');
    }
    
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    return svgContent;
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

function parseElements<T>(
  svgContent: string,
  regex: RegExp,
  parser: (tag: string) => T
): T[] {
  const elements: T[] = [];
  try {
    for (const match of svgContent.matchAll(regex)) {
      const element = parser(match[0]);
      if (element) elements.push(element);
    }
  } catch {
    console.warn(`Error parsing elements`);
  }
  return elements;
}

function getCoords(coords: number[], startIndex: number, count: number): number[] | null {
  if (coords.length < startIndex + count) return null;
  return coords.slice(startIndex, startIndex + count);
}

export function parseSVGContent(svgContent: string): ParsedLatex {
  const glyphs = new Map<string, ParsedGlyph>();
  
  // Parse glyphs with improved character mapping
  try {
    for (const match of svgContent.matchAll(/<glyph[^>]*>/gs)) {
      const tag = match[0];
      const unicode = parseAttribute(tag, 'unicode');
      const glyphName = parseAttribute(tag, 'glyph-name');
      const width = parseAttribute(tag, 'horiz-adv-x', parseFloat) ?? DEFAULT_GLYPH_WIDTH;
      const pathData = parseAttribute(tag, 'd');
      
      if (pathData) {
        if (unicode) {
          glyphs.set(unicode, { width, path: pathData });
        }
        if (glyphName && /^[a-zA-Z0-9]$/.test(glyphName)) {
          glyphs.set(glyphName, { width, path: pathData });
        }
      }
    }
    
    const basicChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (const char of basicChars) {
      if (!glyphs.has(char)) {
        glyphs.set(char, { width: DEFAULT_GLYPH_WIDTH, path: '' });
      }
    }
  } catch (error) {
    console.warn('Error parsing glyphs:', error);
  }
  
  // Parse text elements with tspan support
  const textElements = parseElements(
    svgContent,
    /<text[^>]*>.*?<\/text>/gs,
    (tag) => {
      const x = parseAttribute(tag, 'x', parseFloat) ?? 0;
      const y = parseAttribute(tag, 'y', parseFloat) ?? 0;
      
      const fullContent = tag
        .replace(/<text[^>]*>/, '')
        .replace(/<\/text>/, '')
        .replace(/<tspan[^>]*>/g, '')
        .replace(/<\/tspan>/g, '')
        .trim();
      
      return fullContent ? { x, y, content: fullContent } : null;
    }
  ).filter(Boolean) as ParsedTextElement[];
  
  // Parse path elements
  const pathElements = parseElements(
    svgContent,
    /<path[^>]*\/?>|<path[^>]*>.*?<\/path>/gs,
    (tag) => {
      const d = parseAttribute(tag, 'd');
      return d ? {
        d,
        stroke: parseAttribute(tag, 'stroke'),
        strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
        fill: parseAttribute(tag, 'fill'),
        transform: parseAttribute(tag, 'transform')
      } : null;
    }
  ).filter(Boolean) as ParsedPathElement[];
  
  // Parse line elements
  const lineElements = parseElements(
    svgContent,
    /<line[^>]*\/?>|<line[^>]*>.*?<\/line>/gs,
    (tag) => ({
      x1: parseAttribute(tag, 'x1', parseFloat) ?? 0,
      y1: parseAttribute(tag, 'y1', parseFloat) ?? 0,
      x2: parseAttribute(tag, 'x2', parseFloat) ?? 0,
      y2: parseAttribute(tag, 'y2', parseFloat) ?? 0,
      stroke: parseAttribute(tag, 'stroke'),
      strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
      transform: parseAttribute(tag, 'transform')
    })
  );
  
  // Parse rect elements
  const rectElements = parseElements(
    svgContent,
    /<rect[^>]*\/?>|<rect[^>]*>.*?<\/rect>/gs,
    (tag) => ({
      x: parseAttribute(tag, 'x', parseFloat) ?? 0,
      y: parseAttribute(tag, 'y', parseFloat) ?? 0,
      width: parseAttribute(tag, 'width', parseFloat) ?? 0,
      height: parseAttribute(tag, 'height', parseFloat) ?? 0,
      fill: parseAttribute(tag, 'fill'),
      stroke: parseAttribute(tag, 'stroke'),
      strokeWidth: parseAttribute(tag, 'stroke-width', parseFloat),
      transform: parseAttribute(tag, 'transform')
    })
  );
  
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
      case 'M': {
        const moveCoords = getCoords(coords, 0, 2);
        if (moveCoords) {
          currentX = isRelative ? currentX + moveCoords[0]! : moveCoords[0]!;
          currentY = isRelative ? currentY + moveCoords[1]! : moveCoords[1]!;
          startX = currentX; startY = currentY;
          ctx.moveTo(currentX, currentY);
        }
        break;
      }
      case 'L': {
        const lineCoords = getCoords(coords, 0, 2);
        if (lineCoords) {
          currentX = isRelative ? currentX + lineCoords[0]! : lineCoords[0]!;
          currentY = isRelative ? currentY + lineCoords[1]! : lineCoords[1]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      }
      case 'H': {
        const hCoords = getCoords(coords, 0, 1);
        if (hCoords) {
          currentX = isRelative ? currentX + hCoords[0]! : hCoords[0]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      }
      case 'V': {
        const vCoords = getCoords(coords, 0, 1);
        if (vCoords) {
          currentY = isRelative ? currentY + vCoords[0]! : vCoords[0]!;
          ctx.lineTo(currentX, currentY);
        }
        break;
      }
      case 'C': {
        const cubicCoords = getCoords(coords, 0, 6);
        if (cubicCoords) {
          const cp1x = isRelative ? currentX + cubicCoords[0]! : cubicCoords[0]!;
          const cp1y = isRelative ? currentY + cubicCoords[1]! : cubicCoords[1]!;
          const cp2x = isRelative ? currentX + cubicCoords[2]! : cubicCoords[2]!;
          const cp2y = isRelative ? currentY + cubicCoords[3]! : cubicCoords[3]!;
          currentX = isRelative ? currentX + cubicCoords[4]! : cubicCoords[4]!;
          currentY = isRelative ? currentY + cubicCoords[5]! : cubicCoords[5]!;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, currentX, currentY);
          lastControlX = cp2x; lastControlY = cp2y;
        }
        break;
      }
      case 'S': {
        const smoothCoords = getCoords(coords, 0, 4);
        if (smoothCoords) {
          const scp1x = 2 * currentX - lastControlX;
          const scp1y = 2 * currentY - lastControlY;
          const scp2x = isRelative ? currentX + smoothCoords[0]! : smoothCoords[0]!;
          const scp2y = isRelative ? currentY + smoothCoords[1]! : smoothCoords[1]!;
          currentX = isRelative ? currentX + smoothCoords[2]! : smoothCoords[2]!;
          currentY = isRelative ? currentY + smoothCoords[3]! : smoothCoords[3]!;
          ctx.bezierCurveTo(scp1x, scp1y, scp2x, scp2y, currentX, currentY);
          lastControlX = scp2x; lastControlY = scp2y;
        }
        break;
      }
      case 'Q': {
        const quadCoords = getCoords(coords, 0, 4);
        if (quadCoords) {
          const qcp1x = isRelative ? currentX + quadCoords[0]! : quadCoords[0]!;
          const qcp1y = isRelative ? currentY + quadCoords[1]! : quadCoords[1]!;
          currentX = isRelative ? currentX + quadCoords[2]! : quadCoords[2]!;
          currentY = isRelative ? currentY + quadCoords[3]! : quadCoords[3]!;
          ctx.quadraticCurveTo(qcp1x, qcp1y, currentX, currentY);
          lastControlX = qcp1x; lastControlY = qcp1y;
        }
        break;
      }
      case 'T': {
        const smoothQuadCoords = getCoords(coords, 0, 2);
        if (smoothQuadCoords) {
          const tcp1x = 2 * currentX - lastControlX;
          const tcp1y = 2 * currentY - lastControlY;
          currentX = isRelative ? currentX + smoothQuadCoords[0]! : smoothQuadCoords[0]!;
          currentY = isRelative ? currentY + smoothQuadCoords[1]! : smoothQuadCoords[1]!;
          ctx.quadraticCurveTo(tcp1x, tcp1y, currentX, currentY);
          lastControlX = tcp1x; lastControlY = tcp1y;
        }
        break;
      }
      case 'Z':
        ctx.lineTo(startX, startY);
        ctx.closePath();
        currentX = startX; currentY = startY;
        break;
    }
  }
}

export function renderLatex(
  ctx: NodeCanvasContext | CanvasRenderingContext2D, 
  latexData: ParsedLatex, 
  x: number, 
  y: number, 
  scale = 1
): void {
  const { glyphs, textElements, pathElements, lineElements, rectElements } = latexData;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  for (const pathElement of pathElements) {
    ctx.save();
    applyTransform(ctx, pathElement.transform);
    renderSVGPath(ctx, pathElement.d);
    
    if (pathElement.fill && pathElement.fill !== 'none') {
      ctx.fillStyle = pathElement.fill;
      ctx.fill();
    }
    
    if (pathElement.stroke && pathElement.stroke !== 'none') {
      ctx.strokeStyle = pathElement.stroke;
      ctx.lineWidth = pathElement.strokeWidth ?? DEFAULT_STROKE_WIDTH;
      ctx.stroke();
    } else if (!pathElement.fill || pathElement.fill === 'none') {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  for (const lineElement of lineElements) {
    ctx.save();
    applyTransform(ctx, lineElement.transform);
    ctx.beginPath();
    ctx.moveTo(lineElement.x1, lineElement.y1);
    ctx.lineTo(lineElement.x2, lineElement.y2);
    
    ctx.strokeStyle = lineElement.stroke ?? '#ffffff';
    ctx.lineWidth = lineElement.strokeWidth ?? DEFAULT_STROKE_WIDTH;
    ctx.stroke();
    
    ctx.restore();
  }
  
  for (const rectElement of rectElements) {
    ctx.save();
    applyTransform(ctx, rectElement.transform);
    
    if (rectElement.fill && rectElement.fill !== 'none') {
      ctx.fillStyle = rectElement.fill;
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    if (rectElement.stroke && rectElement.stroke !== 'none') {
      ctx.strokeStyle = rectElement.stroke;
      ctx.lineWidth = rectElement.strokeWidth ?? DEFAULT_STROKE_WIDTH;
      ctx.strokeRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    } else if (!rectElement.fill || rectElement.fill === 'none') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    ctx.restore();
  }
  
  let minX = Infinity, maxX = -Infinity;
  for (const textElement of textElements) {
    let charX = textElement.x;
    for (const char of textElement.content) {
      const glyph = glyphs.get(char);
      if (glyph) {
        minX = Math.min(minX, charX);
        maxX = Math.max(maxX, charX + glyph.width * GLYPH_SCALE_FACTOR);
        charX += glyph.width * GLYPH_SCALE_FACTOR;
      }
    }
  }
  
  const centerOffset = minX !== Infinity ? -(minX + maxX) / 2 : 0;
  
  for (const textElement of textElements) {
    let charX = textElement.x + centerOffset;
    
    for (const char of textElement.content) {
      const glyph = glyphs.get(char);
      if (glyph?.path) {
        ctx.save();
        ctx.translate(charX, textElement.y);
        ctx.scale(GLYPH_SCALE_FACTOR, -GLYPH_SCALE_FACTOR);
        renderSVGPath(ctx, glyph.path);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        charX += glyph.width * GLYPH_SCALE_FACTOR;
      } else {
        ctx.save();
        ctx.translate(charX, textElement.y);
        ctx.scale(1, -1);
        ctx.fillStyle = '#ffffff';
        ctx.font = FALLBACK_FONT;
        ctx.fillText(char, 0, 0);
        ctx.restore();
        charX += FALLBACK_CHAR_WIDTH;
      }
    }
  }
  
  ctx.restore();
}