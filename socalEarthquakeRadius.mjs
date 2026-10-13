/**
 * Calculate the approximate felt radius of an earthquake using the
 * Bakun & Wentworth (1997) Intensity Prediction Equation (IPE) for California.
 * 
 * @param {number} mw - Moment magnitude (Mw)
 * @param {number} depthKm - Focal depth in kilometers (h)
 * @param {number} [targetMMI=2.5] - MMI theshold (2.5 is typical boundary for felt reports, 3.0 for noticeable shaking)
 * @returns {{ radius: number, maxEpicentralMMI: number, hypocentralDist: number }}
 */
export function calculateFeltRadius(mw, depth, targetMMI = 2.5) {
	// Prevent negative depths or zero-division in log10
	const safeDepth = Math.max(depth, 0.1);

	// 1. Calculate theoretical max MMI directly over the hypocenter (Radius = 0)
	const maxEpicentralMMI = 3.87 + 1.17 * mw - 3.38 * Math.log10(safeDepth);

	// 2. Solve for total hypocentral distance (Delta_h) needed to hit targetMMI
	const exponent = (3.87 + 1.17 * mw - targetMMI) / 3.38;
	const hypocentralDist = Math.pow(10, exponent);

	// 3. Solve for surface radius R = sqrt(Delta_h^2 - h^2)
	let radius = 0;
	if (hypocentralDist > safeDepth) {
		radius = Math.sqrt(Math.pow(hypocentralDist, 2) - Math.pow(safeDepth, 2));
	}

	return {
		radius: Number(radius.toFixed(2)),
		maxEpicentralMMI: Number(maxEpicentralMMI.toFixed(2)),
		hypocentralDist: Number(hypocentralDist.toFixed(2))
	};
}