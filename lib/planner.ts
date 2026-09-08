import { SERVICES, SEASON, snowEstimate } from './catalog';
import { preparationSteps, serviceIds } from './assistance';

export interface PlanRecommendation { serviceId: string; reason: string; season: string; assessment: boolean }
export interface GuidedCarePlan {
  mode: 'guided'; reply: string; services: string[]; recommendations: PlanRecommendation[];
  questions: string[]; preparation: string[]; boundaries: string[];
}
export const CARE_GOALS = [
  { id: 'winter', label: 'Winter access', description: 'Snow, entrances and ice', prompt: 'Snow clearing for my driveway and winter entrance access.' },
  { id: 'lawn', label: 'Lawn & garden', description: 'A tidy growing season', prompt: 'Lawn mowing and garden maintenance.' },
  { id: 'seasonal', label: 'Seasonal resets', description: 'Spring and autumn cleanups', prompt: 'Spring yard cleanup and fall leaf cleanup.' },
  { id: 'household', label: 'Home & rental', description: 'Cleaning and collection day', prompt: 'Home cleaning and bin set-out and return.' },
  { id: 'exterior', label: 'Exterior refresh', description: 'Assess suitable surfaces', prompt: 'Exterior pressure washing and ground-access window cleaning assessment.' },
  { id: 'annual', label: 'A full year of care', description: 'Winter, mowing and cleanups', prompt: 'An annual all-season plan for snow, lawn mowing, spring cleanup and fall cleanup.' },
] as const;

const rules: { id: string; pattern: RegExp; reason: string }[] = [
  { id: 'snow', pattern: /\bsnow(?:blow\w*|clear\w*|fall)?\b|\bwinter\b|\bdriveway\b/, reason: 'You mentioned winter access or driveway care.' },
  { id: 'walkways', pattern: /\bwalkway\w*\b|\bentrance\w*\b|\bsteps?\b|\bfront door\b|\bmobility\b/, reason: 'You mentioned entrance paths, steps or accessibility needs.' },
  { id: 'ice', pattern: /\bice\b|\bsalt(?:ing)?\b|\bsand(?:ing)?\b|\bslip\w*\b/, reason: 'You mentioned ice-control or slippery surfaces.' },
  { id: 'windrow', pattern: /\bplow\b|\bplough\b|\bwindrow\b|\bplow-ridge\b/, reason: 'You asked about the ridge at a driveway entrance after plowing.' },
  { id: 'lawn', pattern: /\blawn\b|\bmow\w*\b|\bgrass\b/, reason: 'You mentioned mowing or lawn upkeep.' },
  { id: 'garden', pattern: /\bgarden\w*\b|\bhand weed\w*\b|\bweeding\b|\bflower\w*\b|\bmulch\w*\b/, reason: 'You mentioned garden beds, hand weeding, planting or mulch.' },
  { id: 'spring', pattern: /\bspring\b|\bwinter litter\b/, reason: 'You mentioned a spring reset or winter litter.' },
  { id: 'aeration', pattern: /\baerat\w*\b|\boverseed\w*\b|\bgrass seed\b/, reason: 'You mentioned lawn aeration or overseeding.' },
  { id: 'fall', pattern: /\bfall\b|\bautumn\b|\bleaves\b|\bleaf cleanup\b/, reason: 'You mentioned autumn or leaf cleanup.' },
  { id: 'hedges', pattern: /\bhedge\w*\b|\bshrub\w*\b/, reason: 'You mentioned small hedges or shrubs.' },
  { id: 'bins', pattern: /\bbins?\b|\bgarbage\b|\bcollection day\b/, reason: 'You mentioned bins or collection-day help.' },
  { id: 'furniture', pattern: /\bfurniture\b|\bpack.away\b|\bpatio setup\b/, reason: 'You mentioned outdoor furniture setup or storage.' },
  { id: 'cleaning', pattern: /\bhome cleaning\b|\bhouse cleaning\b|\brental\b|\bturnover\w*\b|\bairbnb\b|\bguest\w*\b/, reason: 'You mentioned home cleaning or rental turnovers.' },
  { id: 'washing', pattern: /\bpressure wash\w*\b|\bexterior wash\w*\b|\bpatio clean\w*\b/, reason: 'You mentioned cleaning hard exterior surfaces.' },
  { id: 'windows', pattern: /\bwindow\w*\b/, reason: 'You mentioned window cleaning; ground access needs assessment.' },
  { id: 'gutters', pattern: /\bgutter\w*\b/, reason: 'You mentioned gutters; access and the appropriate method need assessment.' },
  { id: 'hauling', pattern: /\bhauling\b|\bwaste removal\b|\byard waste\b|\bjunk\b/, reason: 'You mentioned removing material; eligibility and disposal need a separate assessment.' },
];

function requestedNeeds(message: string): { clean: string; excluded: Set<string> } {
  const excluded = new Set<string>();
  // Explicit exclusions override the standard annual bundle. This is keyword
  // matching, so keep the original needs visible for the customer's final review.
  const clean = message.replace(/\b(?:no|without|do not need|don't need|not interested in|exclude)\s+(?:any\s+)?([^.!?;\n]+?)(?=\s+but\b|[.!?;\n]|$)/gi, clause => {
    for (const rule of rules) if (rule.pattern.test(clause)) excluded.add(rule.id);
    return '';
  });
  return { clean, excluded };
}

export function buildPlanForServices(ids: string[], reasons: Record<string, string> = {}): Omit<GuidedCarePlan, 'mode' | 'reply'> {
  const services = serviceIds(ids);
  const recommendations = services.map(id => {
    const service = SERVICES.find(item => item.id === id)!;
    return { serviceId: id, reason: reasons[id] || 'You selected this service for your property plan.', season: service.category, assessment: service.frequency === 'By assessment' };
  });
  const questions = ['What are the property address, community and preferred visit frequency?', 'What access restrictions, dimensions, gates, pets or fragile areas should Trios know about?'];
  if (services.some(id => ['snow', 'walkways', 'ice', 'windrow'].includes(id))) questions.push('What are the clearing dimensions, surface, slope and available snow-placement space?', 'Do you need priority review, a departure time considered, walkways or salting included in the quote?');
  if (services.some(id => ['lawn', 'garden', 'aeration'].includes(id))) questions.push('What is the approximate lawn or garden area and the narrowest gate width?');
  if (services.includes('cleaning')) questions.push('Which rooms, turnover tasks, linen changes and supplies are in scope?');
  if (services.some(id => ['spring', 'fall', 'hauling'].includes(id))) questions.push('Should collected material stay on the property, or should removal be assessed separately?');
  const boundaries = [...new Set(services.map(id => SERVICES.find(s => s.id === id)!.scope))];
  return { services, recommendations, questions: services.length ? questions : [], preparation: services.length ? preparationSteps(services) : [], boundaries };
}

export function guidedPlan(message: string): GuidedCarePlan {
  const { clean, excluded } = requestedNeeds(message.toLowerCase()), ids: string[] = [], reasons: Record<string, string> = {};
  if (/\b(?:year.round|all.season|annual|full year|four.season)\b/.test(clean)) for (const id of ['snow', 'lawn', 'spring', 'fall']) { ids.push(id); reasons[id] = 'You asked for year-round care, so this covers one part of the annual service cycle.'; }
  for (const rule of rules) if (rule.pattern.test(clean)) { ids.push(rule.id); reasons[rule.id] ||= rule.reason; }
  const plan = buildPlanForServices(ids.filter(id => !excluded.has(id)), reasons), notes: string[] = [];
  if (plan.services.includes('snow')) {
    const reference = snowEstimate('1', false);
    notes.push(`Winter service season: ${SEASON}.${reference === null ? '' : ` Single-driveway reference pricing starts at $${reference} CAD.`} Final scope, tax, availability and pricing are reviewed separately.`);
  }
  if (plan.services.includes('lawn')) notes.push('Weekly or fortnightly mowing can be requested; area, slope, access and growth affect the quote.');
  if (/\bpriority\b|\bdeparture\b|\bbefore work\b|\bearly morning\b/.test(clean)) notes.push('Include your departure needs for priority review. The agreed response window depends on route capacity.');
  if (/\broof\b|\belectrical\b|\bplumbing\b|\bconstruction\b|\bpesticide\w*\b|\bherbicide\w*\b/.test(clean)) notes.push('Roof work, electrical work, plumbing, construction and pesticide applications are outside routine Trios maintenance. A suitable specialist may be needed.');
  if (plan.recommendations.some(r => r.assessment)) notes.push('Assessment services remain subject to access, scope and availability review; they are not confirmed visits.');
  return { ...plan, mode: 'guided', reply: plan.services.length
    ? `Suggested starting services: ${plan.services.map(id => SERVICES.find(s => s.id === id)!.name).join(', ')}.\n\n${notes.join('\n\n') || 'Review your property details and preparation checklist, then adjust the selected services before requesting a quote.'}\n\nNo service date, payment or booking is confirmed by this plan.`
    : `${notes.length ? notes.join('\n\n') + '\n\n' : ''}Tell us which areas need care: winter driveway access, lawn mowing, seasonal cleanup, garden upkeep, bins or home cleaning. Include access needs and preferred frequency to make your plan more useful.` };
}

export function carePlanBookingUrl(ids: string[]): string {
  const services = serviceIds(ids);
  return services.length ? `/book?services=${encodeURIComponent(services.join(','))}&plan=care-planner` : '/book';
}
