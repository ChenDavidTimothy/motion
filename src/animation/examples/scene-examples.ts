// src/animation/examples/scene-examples.ts
import type { AnimationScene } from '../scene/scene';
import { 
  createMoveAnimation, 
  createRotateAnimation, 
  createScaleAnimation 
} from '../scene/timeline';

// Example 1: Three triangles forming a pattern
export function createTriangleFormation(): AnimationScene {
  return {
    duration: 4,
    objects: [
      {
        id: "tri-top",
        type: "triangle",
        properties: { size: 80, color: "#ff6b6b", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 960, y: 200 },
        initialOpacity: 0
      },
      {
        id: "tri-left",
        type: "triangle", 
        properties: { size: 80, color: "#4ecdc4", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 500, y: 600 },
        initialOpacity: 0
      },
      {
        id: "tri-right",
        type: "triangle",
        properties: { size: 80, color: "#45b7d1", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 1420, y: 600 },
        initialOpacity: 0
      }
    ],
    animations: [
      // Fade in all triangles
      { objectId: "tri-top", type: "fade", startTime: 0, duration: 1, easing: "easeOut", properties: { from: 0, to: 1 } },
      { objectId: "tri-left", type: "fade", startTime: 0.5, duration: 1, easing: "easeOut", properties: { from: 0, to: 1 } },
      { objectId: "tri-right", type: "fade", startTime: 1, duration: 1, easing: "easeOut", properties: { from: 0, to: 1 } },
      
      // Rotate all triangles
      ...createRotateAnimation("tri-top", 1, 1.5, 2.5, "linear"),
      ...createRotateAnimation("tri-left", -1, 1.5, 2.5, "linear"), 
      ...createRotateAnimation("tri-right", 1, 1.5, 2.5, "linear"),
    ],
    background: { color: "#1a1a2e" }
  };
}

// Example 2: Geometric dance
export function createGeometricDance(): AnimationScene {
  return {
    duration: 6,
    objects: [
      // Central circle
      {
        id: "center-circle",
        type: "circle",
        properties: { radius: 100, color: "#f39c12", strokeColor: "#ffffff", strokeWidth: 3 },
        initialPosition: { x: 960, y: 540 }
      },
      // Orbiting triangles
      {
        id: "orbit-tri-1",
        type: "triangle", 
        properties: { size: 40, color: "#e74c3c", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 1160, y: 540 } // 200px right of center
      },
      {
        id: "orbit-tri-2",
        type: "triangle",
        properties: { size: 40, color: "#3498db", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 760, y: 540 } // 200px left of center  
      },
      // Corner rectangles
      {
        id: "corner-rect-1",
        type: "rectangle",
        properties: { width: 60, height: 60, color: "#9b59b6", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 100, y: 100 }
      },
      {
        id: "corner-rect-2", 
        type: "rectangle",
        properties: { width: 60, height: 60, color: "#2ecc71", strokeColor: "#ffffff", strokeWidth: 2 },
        initialPosition: { x: 1820, y: 980 }
      }
    ],
    animations: [
      // Center circle pulse
      { objectId: "center-circle", type: "scale", startTime: 0, duration: 6, easing: "easeInOut", 
        properties: { from: 1, to: 1.3 } },
      
      // Orbiting triangles - circular motion simulation with multiple moves
      { objectId: "orbit-tri-1", type: "move", startTime: 0, duration: 6, easing: "linear",
        properties: { from: { x: 1160, y: 540 }, to: { x: 960, y: 340 } } },
      { objectId: "orbit-tri-2", type: "move", startTime: 0, duration: 6, easing: "linear", 
        properties: { from: { x: 760, y: 540 }, to: { x: 960, y: 740 } } },
        
      // Triangle rotations
      { objectId: "orbit-tri-1", type: "rotate", startTime: 0, duration: 6, easing: "linear",
        properties: { from: 0, to: 0, rotations: 4 } },
      { objectId: "orbit-tri-2", type: "rotate", startTime: 0, duration: 6, easing: "linear",
        properties: { from: 0, to: 0, rotations: -4 } },
        
      // Corner rectangles move to center and back
      { objectId: "corner-rect-1", type: "move", startTime: 1, duration: 2, easing: "easeInOut",
        properties: { from: { x: 100, y: 100 }, to: { x: 800, y: 400 } } },
      { objectId: "corner-rect-1", type: "move", startTime: 4, duration: 2, easing: "easeInOut",
        properties: { from: { x: 800, y: 400 }, to: { x: 100, y: 100 } } },
        
      { objectId: "corner-rect-2", type: "move", startTime: 1.5, duration: 2, easing: "easeInOut", 
        properties: { from: { x: 1820, y: 980 }, to: { x: 1120, y: 680 } } },
      { objectId: "corner-rect-2", type: "move", startTime: 4.5, duration: 1.5, easing: "easeInOut",
        properties: { from: { x: 1120, y: 680 }, to: { x: 1820, y: 980 } } },
    ],
    latex: {
      equation: "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}",
      position: { x: 600, y: 150 },
      scale: 4
    },
    background: { color: "#0c0c0c" }
  };
}

// Example 3: Simple physics simulation
export function createBouncingBalls(): AnimationScene {
  return {
    duration: 5,
    objects: [
      {
        id: "ball-1",
        type: "circle",
        properties: { radius: 30, color: "#ff4757", strokeColor: "#ffffff", strokeWidth: 1 },
        initialPosition: { x: 200, y: 200 }
      },
      {
        id: "ball-2", 
        type: "circle",
        properties: { radius: 25, color: "#5352ed", strokeColor: "#ffffff", strokeWidth: 1 },
        initialPosition: { x: 400, y: 200 }
      },
      {
        id: "ball-3",
        type: "circle", 
        properties: { radius: 35, color: "#00d2d3", strokeColor: "#ffffff", strokeWidth: 1 },
        initialPosition: { x: 600, y: 200 }
      }
    ],
    animations: [
      // Simulate bouncing with multiple move animations
      { objectId: "ball-1", type: "move", startTime: 0, duration: 1, easing: "easeIn",
        properties: { from: { x: 200, y: 200 }, to: { x: 300, y: 800 } } },
      { objectId: "ball-1", type: "move", startTime: 1, duration: 0.8, easing: "easeOut", 
        properties: { from: { x: 300, y: 800 }, to: { x: 500, y: 300 } } },
      { objectId: "ball-1", type: "move", startTime: 1.8, duration: 0.6, easing: "easeIn",
        properties: { from: { x: 500, y: 300 }, to: { x: 700, y: 700 } } },
      { objectId: "ball-1", type: "move", startTime: 2.4, duration: 0.4, easing: "easeOut",
        properties: { from: { x: 700, y: 700 }, to: { x: 900, y: 450 } } },
      { objectId: "ball-1", type: "move", startTime: 2.8, duration: 2.2, easing: "easeIn", 
        properties: { from: { x: 900, y: 450 }, to: { x: 1400, y: 850 } } },
        
      // Similar for other balls with delays
      { objectId: "ball-2", type: "move", startTime: 0.3, duration: 1.2, easing: "easeIn",
        properties: { from: { x: 400, y: 200 }, to: { x: 600, y: 750 } } },
      { objectId: "ball-2", type: "move", startTime: 1.5, duration: 1, easing: "easeOut",
        properties: { from: { x: 600, y: 750 }, to: { x: 900, y: 250 } } },
      { objectId: "ball-2", type: "move", startTime: 2.5, duration: 2.5, easing: "easeIn", 
        properties: { from: { x: 900, y: 250 }, to: { x: 1500, y: 800 } } },
        
      { objectId: "ball-3", type: "move", startTime: 0.6, duration: 1.5, easing: "easeIn",
        properties: { from: { x: 600, y: 200 }, to: { x: 900, y: 700 } } },
      { objectId: "ball-3", type: "move", startTime: 2.1, duration: 1.2, easing: "easeOut",
        properties: { from: { x: 900, y: 700 }, to: { x: 1300, y: 300 } } },
      { objectId: "ball-3", type: "move", startTime: 3.3, duration: 1.7, easing: "easeIn",
        properties: { from: { x: 1300, y: 300 }, to: { x: 1700, y: 750 } } },
    ],
    background: { color: "#2f3542" }
  };
}

// Export all examples
export const SCENE_EXAMPLES = {
  triangleFormation: createTriangleFormation,
  geometricDance: createGeometricDance, 
  bouncingBalls: createBouncingBalls
} as const;