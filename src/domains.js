// 首期内置领域模板（文档 3.x）：一个领域 = 一张可配置的预测卡
export const BUILTIN_DOMAINS = [
  {
    id: 'd-video-likes',
    name: '视频点赞量',
    prediction_type: 'numeric',
    form_config: { tolerance: 0.3, unit: '点赞', hint: '看标题/封面猜这个视频的点赞量' },
    noise_default: 'high',
    deadline_days: 7,
    builtin: 1,
    icon: '▶',
  },
  {
    id: 'd-resume',
    name: '简历录取',
    prediction_type: 'binary',
    form_config: { hint: '看简历猜这个人会不会被录用/约面' },
    noise_default: 'mid',
    deadline_days: 3,
    builtin: 1,
    icon: '⊞',
  },
  {
    id: 'd-task-eta',
    name: '任务工期',
    prediction_type: 'time',
    form_config: { tolerance: 0.25, unit: '天', hint: '开工前猜这件事要几天做完' },
    noise_default: 'mid',
    deadline_days: 14,
    builtin: 1,
    icon: '⏱',
  },
  {
    id: 'd-event',
    name: '事件走向',
    prediction_type: 'multi',
    form_config: { options: ['上行', '横盘', '下行'], hint: '猜这件事下一步往哪个方向走' },
    noise_default: 'high',
    deadline_days: 7,
    builtin: 1,
    icon: '⇄',
  },
];

export function defaultFormFor(type) {
  if (type === 'numeric') return { tolerance: 0.2 };
  if (type === 'time') return { tolerance: 0.25, unit: '天' };
  if (type === 'multi') return { options: ['A', 'B', 'C'] };
  return {};
}
