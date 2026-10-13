export function calculateZoom(radiusKm: number): number {
    // Logic: Zoom 12 is roughly 15km wide.
    // Every zoom level decrease (e.g. 12 -> 11) doubles the visible distance.
    if (radiusKm <= 0) return 14; 
    
    const zoom = 12 - Math.log2(radiusKm);
    return Math.max(4, Math.min(16, Math.round(zoom)));
}