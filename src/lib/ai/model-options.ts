export type RegisteredAiModel = {
  provider: 'google' | 'openai' | 'anthropic';
  model_id: string;
  display_name: string;
  tier: 'free' | 'cheap' | 'balanced' | 'premium';
  cost_rank: number;
};

export type AiMode = 'auto' | 'standard' | 'gemini' | 'openai' | 'openai_luna' | 'openai_terra' | 'openai_sol' | 'anthropic' | 'anthropic_haiku' | 'anthropic_sonnet' | 'anthropic_opus';

export const fallbackAiModelOptions: { mode: AiMode; label: string }[] = [
  { mode: 'gemini', label: 'Gemini 3.6 Flash · free' },
  { mode: 'openai_luna', label: 'OpenAI GPT-5.6 Luna · cheap' },
  { mode: 'anthropic_haiku', label: 'Claude Haiku 4.5 · cheap' },
  { mode: 'openai_terra', label: 'OpenAI GPT-5.6 Terra · balanced' },
  { mode: 'anthropic_sonnet', label: 'Claude Sonnet 5 · balanced' },
  { mode: 'openai_sol', label: 'OpenAI GPT-5.6 Sol · premium' },
  { mode: 'anthropic_opus', label: 'Claude Opus 5 · premium' },
];

export function getDynamicModelOptions(models: RegisteredAiModel[]): { mode: AiMode; label: string }[] {
  const modeFor = (model: RegisteredAiModel): AiMode | null => {
    if (model.provider === 'google' && model.tier === 'free') return 'gemini';
    if (model.provider === 'openai' && model.tier === 'cheap') return 'openai_luna';
    if (model.provider === 'openai' && model.tier === 'balanced') return 'openai_terra';
    if (model.provider === 'openai' && model.tier === 'premium') return 'openai_sol';
    if (model.provider === 'anthropic' && model.tier === 'cheap') return 'anthropic_haiku';
    if (model.provider === 'anthropic' && model.tier === 'balanced') return 'anthropic_sonnet';
    if (model.provider === 'anthropic' && model.tier === 'premium') return 'anthropic_opus';
    return null;
  };
  const seen = new Set<string>();
  return [...models]
    .sort((a, b) => a.cost_rank - b.cost_rank || b.model_id.localeCompare(a.model_id))
    .flatMap((model) => {
      const mode = modeFor(model);
      if (!mode || seen.has(mode)) return [];
      seen.add(mode);
      return [{ mode, label: `${model.display_name} · ${model.tier}` }];
    });
}
