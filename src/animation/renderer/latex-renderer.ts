// src/animation/renderer/latex-renderer.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ParsedLatex, ParsedGlyph, ParsedTextElement, ParsedPathElement, NodeCanvasContext } from '../types';

const execAsync = promisify(exec);

interface CSSClass {
  fontFamily: string;
  fontSize: number;
}

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
        // Silent cleanup failure
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

function parseCSSStyles(svgContent: string): { classMap: Map<string, CSSClass>, baseFontSize: number } {
  const classMap = new Map<string, CSSClass>();
  
  const styleRegex = /<style[^>]*>(.*?)<\/style>/s;
  const styleMatch = styleRegex.exec(svgContent);
  if (!styleMatch?.[1]) {
    return { classMap, baseFontSize: 12 };
  }
  
  const cssContent = styleMatch[1];
  const cssRules = cssContent.matchAll(/text\.([^{]+)\s*\{[^}]*font-family:\s*([^;]+);\s*font-size:\s*([0-9.]+)px[^}]*\}/g);
  
  for (const rule of cssRules) {
    const className = rule[1]?.trim();
    const fontFamily = rule[2]?.trim();
    const fontSize = rule[3] !== undefined ? parseFloat(rule[3]) : NaN;
    
    if (className && fontFamily && !isNaN(fontSize)) {
      classMap.set(className, { fontFamily, fontSize });
    }
  }
  
  const baseFontSize = classMap.size > 0 
    ? Math.max(...Array.from(classMap.values()).map(c => c.fontSize))
    : 12;
    
  return { classMap, baseFontSize };
}

function parseGlyphsByFont(svgContent: string): Map<string, Map<string, ParsedGlyph>> {
  const fontGlyphs = new Map<string, Map<string, ParsedGlyph>>();
  
  const fontMatches = [...svgContent.matchAll(/<font[^>]*id=['"]([^'"]*)['"]/g)];
  
  for (const fontMatch of fontMatches) {
    const fontId = fontMatch[1];
    if (!fontId) continue;
    
    const fontGlyphMap = new Map<string, ParsedGlyph>();
    
    // Find font block and extract glyphs
    const fontBlockRegex = new RegExp(`<font[^>]*id=['"]${fontId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"][^>]*>.*?</font>`, 's');
    const fontBlock = fontBlockRegex.exec(svgContent);
    
    if (fontBlock) {
      const glyphMatches = [...fontBlock[0].matchAll(/<glyph[^>]*>/g)];
      
      for (const glyphMatch of glyphMatches) {
        const tag = glyphMatch[0];
        const unicode = parseAttribute(tag, 'unicode');
        const glyphName = parseAttribute(tag, 'glyph-name');
        const width = parseAttribute(tag, 'horiz-adv-x', parseFloat) ?? 500;
        const pathData = parseAttribute(tag, 'd');
        
        if (pathData) {
          if (unicode) {
            fontGlyphMap.set(unicode, { width, path: pathData });
          }
          if (glyphName) {
            fontGlyphMap.set(glyphName, { width, path: pathData });
          }
        }
      }
    }
    
    fontGlyphs.set(fontId, fontGlyphMap);
  }
  
  return fontGlyphs;
}

export function parseSVGContent(svgContent: string): ParsedLatex {
  const fontGlyphs = parseGlyphsByFont(svgContent);
  const { classMap, baseFontSize } = parseCSSStyles(svgContent);
  
  const textElements: ParsedTextElement[] = [];
  try {
    for (const match of svgContent.matchAll(/<text[^>]*>.*?<\/text>/gs)) {
      const textTag = match[0];
      const x = parseAttribute(textTag, 'x', parseFloat) ?? 0;
      const y = parseAttribute(textTag, 'y', parseFloat) ?? 0;
      const cssClass = parseAttribute(textTag, 'class');
      const classInfo = cssClass ? classMap.get(cssClass) : undefined;
      
      const content = textTag
        .replace(/<text[^>]*>/, '')
        .replace(/<\/text>/, '')
        .replace(/<tspan[^>]*>.*?<\/tspan>/g, '')
        .trim();
      
      if (content) {
        textElements.push({ 
          x, 
          y, 
          content,
          fontSize: classInfo?.fontSize,
          fontFamily: classInfo?.fontFamily
        });
      }
      
      const tspanMatches = [...textTag.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)];
      for (const tspanMatch of tspanMatches) {
        const tspanTag = tspanMatch[0];
        const char = tspanMatch[1]?.trim();
        
        if (char) {
          const tspanX = parseAttribute(tspanTag, 'x', parseFloat) ?? x;
          const tspanY = parseAttribute(tspanTag, 'y', parseFloat) ?? y;
          const tspanClass = parseAttribute(tspanTag, 'class') ?? cssClass;
          const tspanClassInfo = tspanClass ? classMap.get(tspanClass) : classInfo;
          
          textElements.push({ 
            x: tspanX, 
            y: tspanY, 
            content: char,
            fontSize: tspanClassInfo?.fontSize,
            fontFamily: tspanClassInfo?.fontFamily
          });
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing text elements:', error);
  }
  
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
  
  return { 
    fontGlyphs,
    textElements, 
    pathElements, 
    lineElements, 
    rectElements,
    baseFontSize
  };
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
  
  const baseFontSize = latexData.baseFontSize ?? 12;
  
  // Render paths
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
  
  // Render lines
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
  
  // Render rectangles
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
  
  // Render text with font-family aware glyph lookup
  for (const textElement of latexData.textElements) {
    if (textElement.content.length === 1) {
      const char = textElement.content;
      const fontFamily = textElement.fontFamily;
      const glyph = fontFamily ? latexData.fontGlyphs.get(fontFamily)?.get(char) : undefined;
      const elementFontSize = textElement.fontSize ?? baseFontSize;
      const relativeScale = elementFontSize / baseFontSize;
      
      ctx.save();
      ctx.translate(textElement.x, textElement.y);
      ctx.scale(0.01 * relativeScale, -0.01 * relativeScale);
      
      if (glyph?.path) {
        renderSVGPath(ctx, glyph.path);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        ctx.scale(100, -100);
        ctx.fillStyle = '#ffffff';
        ctx.font = `${12 * relativeScale}px serif`;
        ctx.fillText(char, 0, 0);
      }
      
      ctx.restore();
    } else if (textElement.content.length > 1) {
      const fontFamily = textElement.fontFamily;
      const elementFontSize = textElement.fontSize ?? baseFontSize;
      const relativeScale = elementFontSize / baseFontSize;
      
      ctx.save();
      ctx.translate(textElement.x, textElement.y);
      ctx.scale(0.01 * relativeScale, -0.01 * relativeScale);
      
      let charOffset = 0;
      for (const char of textElement.content) {
        const glyph = fontFamily ? latexData.fontGlyphs.get(fontFamily)?.get(char) : undefined;
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
          ctx.font = `${12 * relativeScale}px serif`;
          ctx.fillText(char, 0, 0);
          ctx.restore();
          charOffset += 600 * relativeScale;
        }
      }
      
      ctx.restore();
    }
  }
  
  ctx.restore();
}