"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

export function AnimationGenerator() {
  const [equation, setEquation] = useState("a^{2} + b^{2} = c^{2}");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const generateAnimation = api.animation.generateTriangle.useMutation({
    onSuccess: (data) => {
      setVideoUrl(data.videoUrl);
    },
    onError: (error) => {
      console.error("Animation generation failed:", error);
      alert(`Failed to generate animation: ${error.message}`);
    },
  });

  const handleGenerate = () => {
    if (!equation.trim()) {
      alert("Please enter a LaTeX equation");
      return;
    }
    
    setVideoUrl(null);
    generateAnimation.mutate({
      equation: equation.trim(),
      config: {
        duration: 3,
        fps: 60, // Reduced from 120 for faster generation
        triangleColor: "#ff4444",
        strokeColor: "#ffffff",
      }
    });
  };

  const handleDownload = () => {
    if (videoUrl) {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = `triangle_animation_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="space-y-2">
        <label htmlFor="equation" className="block text-sm font-medium text-white">
          LaTeX Equation:
        </label>
        <input
          id="equation"
          type="text"
          value={equation}
          onChange={(e) => setEquation(e.target.value)}
          placeholder="Enter LaTeX equation (e.g., a^{2} + b^{2} = c^{2})"
          className="w-full rounded-md bg-white/10 px-3 py-2 text-white placeholder-white/60 border border-white/20 focus:border-white/40 focus:outline-none"
        />
      </div>
      
      <button
        onClick={handleGenerate}
        disabled={generateAnimation.isPending}
        className="w-full rounded-md bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 font-semibold text-white transition hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generateAnimation.isPending ? "Generating Animation..." : "Generate Triangle Animation"}
      </button>

      {generateAnimation.isPending && (
        <div className="text-center text-sm text-white/80">
          This may take 10-30 seconds depending on server load...
        </div>
      )}

      {videoUrl && (
        <div className="space-y-3 rounded-md bg-white/5 p-4">
          <div className="text-center text-sm text-green-400 font-medium">
            ✅ Animation generated successfully!
          </div>
          
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="w-full rounded-md"
          >
            Your browser does not support the video tag.
          </video>
          
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-700"
            >
              Download MP4
            </button>
            <button
              onClick={() => window.open(videoUrl, '_blank')}
              className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Open in New Tab
            </button>
          </div>
        </div>
      )}
    </div>
  );
}