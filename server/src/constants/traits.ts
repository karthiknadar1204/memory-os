// 90-dim User Traits per paper Sec 3.3 (Li et al., 2025):
// 3 categories × 30 dimensions each.

export const BASIC_NEEDS_PERSONALITY = [
  'openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism',
  'curiosity', 'optimism', 'resilience', 'empathy', 'patience',
  'risk_tolerance', 'spontaneity', 'discipline', 'ambition', 'creativity',
  'sociability', 'introspection', 'humor', 'assertiveness', 'cooperation',
  'need_for_achievement', 'need_for_autonomy', 'need_for_belonging', 'need_for_security', 'need_for_recognition',
  'need_for_growth', 'need_for_variety', 'need_for_stability', 'need_for_competence', 'need_for_purpose',
] as const;

export const AI_ALIGNMENT = [
  'prefers_concise_answers', 'prefers_detailed_answers', 'prefers_formal_tone', 'prefers_casual_tone', 'prefers_humor',
  'prefers_step_by_step', 'prefers_examples', 'prefers_analogies', 'prefers_direct_feedback', 'prefers_encouragement',
  'prefers_data_driven', 'prefers_intuition', 'prefers_visual_aids', 'prefers_proactive_suggestions', 'prefers_only_when_asked',
  'tolerance_for_uncertainty', 'preference_for_caveats', 'preference_for_confidence', 'preference_for_brevity', 'preference_for_depth',
  'preference_for_lists', 'preference_for_prose', 'preference_for_questions_back', 'preference_for_actionable_steps', 'preference_for_theory',
  'safety_consciousness', 'privacy_consciousness', 'fact_check_appetite', 'pushback_tolerance', 'creative_latitude',
] as const;

export const CONTENT_INTERESTS = [
  'technology', 'programming', 'ai_ml', 'science', 'mathematics',
  'fitness', 'nutrition', 'sports', 'outdoor_activities', 'travel',
  'food_cooking', 'music', 'film_tv', 'gaming', 'reading',
  'art_design', 'photography', 'writing', 'fashion', 'finance',
  'business', 'career', 'education', 'history', 'philosophy',
  'politics', 'environment', 'health_wellness', 'relationships', 'spirituality',
] as const;

export const ALL_TRAIT_DIMENSIONS = [
  ...BASIC_NEEDS_PERSONALITY,
  ...AI_ALIGNMENT,
  ...CONTENT_INTERESTS,
] as const;

export function defaultTraits(): Record<string, number> {
  const obj: Record<string, number> = {};
  for (const dim of ALL_TRAIT_DIMENSIONS) obj[dim] = 0;
  return obj;
}
