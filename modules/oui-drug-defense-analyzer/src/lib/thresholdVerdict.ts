import { LabResultData, LabTestComponent } from '../types';

export interface ThresholdVerdict {
  substance: string;
  position: 'spans' | 'above' | 'below';
  statement: string;
}

export function computeThresholdVerdictForComponent(component: LabTestComponent): ThresholdVerdict {
  const detected = component.detectedValue;
  const uncertainty = component.uncertaintyRange || 0;
  const minBound = Math.max(0, parseFloat((detected - uncertainty).toFixed(4)));
  const maxBound = parseFloat((detected + uncertainty).toFixed(4));

  // Determine effective cutoff
  let cutoff = component.cutoffLevel;
  if (component.substance.toLowerCase().includes('ethanol') || component.substance.toLowerCase().includes('bac') || component.unit === 'g/100mL') {
    cutoff = 0.080;
  }

  let position: 'spans' | 'above' | 'below' = 'above';
  if (minBound < cutoff && maxBound >= cutoff) {
    position = 'spans';
  } else if (maxBound < cutoff) {
    position = 'below';
  } else if (minBound >= cutoff) {
    position = 'above';
  }

  let statement = '';
  if (position === 'spans') {
    statement = `The reported ${component.substance} of ${detected} ${component.unit} spans the ${cutoff} ${component.unit} cutoff once the laboratory's own stated measurement uncertainty is applied (${minBound} to ${maxBound} ${component.unit}). The true value cannot be said to exceed the cutoff to a reasonable degree of scientific certainty.`;
  } else if (position === 'below') {
    statement = `The reported ${component.substance} of ${detected} ${component.unit} falls below the ${cutoff} ${component.unit} cutoff when considering measurement uncertainty (${minBound} to ${maxBound} ${component.unit}).`;
  } else {
    statement = `The reported ${component.substance} of ${detected} ${component.unit} remains above the ${cutoff} ${component.unit} cutoff even at the lower bound of measurement uncertainty (${minBound} to ${maxBound} ${component.unit}).`;
  }

  return {
    substance: component.substance,
    position,
    statement
  };
}

export function computeAllThresholdVerdicts(labData?: LabResultData): ThresholdVerdict[] {
  if (!labData || !labData.components || labData.components.length === 0) {
    return [];
  }
  return labData.components.map(computeThresholdVerdictForComponent);
}
