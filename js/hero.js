/**
 * Creva Solutions - Modern Agency Hero Interactions
 * Lightweight progressive enhancement for the curved service journey
 */

document.addEventListener('DOMContentLoaded', () => {
  const journeyPath = document.getElementById('hero-journey-path');
  const guidePath = document.getElementById('hero-guide-path');
  
  if (!journeyPath) return;

  // Check if reduced motion is requested
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    journeyPath.style.strokeDashoffset = '0';
    return;
  }

  // Calculate actual SVG path length dynamically for pixel-perfect stroke animation
  try {
    const totalLength = journeyPath.getTotalLength();
    if (totalLength && totalLength > 0) {
      journeyPath.style.strokeDasharray = `${totalLength}`;
      journeyPath.style.strokeDashoffset = `${totalLength}`;

      // Trigger the drawing animation with ease-out
      requestAnimationFrame(() => {
        journeyPath.style.transition = 'stroke-dashoffset 2.8s cubic-bezier(0.25, 1, 0.45, 1)';
        journeyPath.style.strokeDashoffset = '0';
      });
    }
  } catch (err) {
    // Fallback to CSS keyframe animation if getTotalLength is unavailable
    console.debug('SVG getTotalLength not supported or error:', err);
  }
});
