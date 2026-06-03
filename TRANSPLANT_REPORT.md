# Nexus-Engine 移植报告 v2.1

> 基于 `github.com/dylanyunlon/Pantheon` (upstream) + OSDK (palantir/osdk-ts) 瞬时决策模式  
> 策略：mv 基础上动态修改算法 ~20%，大幅增强调试/断点基础设施

---

## 移植概况

| 指标 | 数值 |
|------|------|
| 源文件总数（mv过来的） | 910 |
| 核心引擎模块 | 20 个 TypeScript 文件 |
| 算法改动点 | 62 处（公式/阈值/数据结构行为） |
| 新增调试代码 | ~200 行增强 |
| 运行验证 | `npx tsx src/debug/run-pipeline.ts` |

---

## 算法改动清单（仅列出公式/逻辑级别的改动）

### 1. `core/scoring.ts` — 评分引擎（11处改动）

**压缩函数重构：**
- sigmoid-log → **ELU-logSinh 混合**
  - 分界点：ratio < 0.4 → ratio < 0.35
  - low端：sigmoid → **ELU（负值软裁剪，正值线性保梯度）**
  - high端：log1p → **logSinh（衰减曲线更平滑）**

**权重微调：**
| 维度 | upstream | nexus-engine |
|------|---------|-------------|
| kda | 0.20 | 0.19 |
| cs | 0.13 | 0.14 |
| damage | 0.21 | 0.20 |
| vision | 0.11 | 0.12 |
| participation | 0.15 | 0.14 |
| consistency | 0.12 | 0.13 |

**其他公式改动：**
- 一致性衰减：`exp(-cv²×0.8)` → **`1/(1+cv^2.6×1.1²)`** (Cauchy衰减，长尾更温和)
- KDA steepness：2.2 → 2.4
- Vision steepness：1.9 → 2.1
- CS满分线：7.5/min → 7.2/min
- 连胜bonus系数：log2(n)×8 → log2(n+1)×7.5
- 连败penalty系数：log2(n)×6 → log2(n+1)×5.5
- Clamp范围：[-15,25] → [-18,22]
- 高分非线性校正：>85分时压缩 `85 + (raw-85)×0.7`
- 漂移告警阈值：15→12

### 2. `pipeline/engine.ts` — 流水线引擎（5处改动）

- Tier阈值：75/55/35/15 → **78/58/32/12**（非均匀间距，上层更密）
- 团队均分：算术平均 → **鲁棒均值**（去头尾后70%鲁棒+30%原始混合）
- RingAggregator.reduce：等权 → **位置衰减加权**（recency bias 5%）
- debugPrintEngineState：新增内存占用估算
- debugPrintAdviceSummary：新增置信度分布统计

### 3. `pipeline/stages.ts` — 16个分析阶段（11处改动）

| 参数 | upstream | nexus-engine |
|------|---------|-------------|
| 对手弱点胜率阈值 | 0.44 | 0.46 |
| 对手KDA阈值 | 1.7 | 1.8 |
| 连败置信度模型 | 线性截断 | **sigmoid饱和** |
| 队友伤害阈值 | 0.76 | 0.74 |
| 参团率阈值 | 0.60 | 0.58 |
| 视野阈值 | 1.3 | 1.2 |
| 宏观置信度衰减 | sqrt | **cbrt** |
| 宏观差值阈值 | ±2.5 | ±3.0 |
| 拿手角色胜率线 | 0.60 | 0.58 |
| 经济效率阈值 | 0.62 | 0.60 |
| KDA波动阈值 | 0.70 | 0.65 |

### 4. `cache/index.ts` — 缓存层（4处改动）

- shouldReplace模型：双段混合 → **三段混合**（指数55% + 线性25% + 余弦退火20%）
- 时钟算法：无条件第二次机会 → **超过60秒的老条目直接淘汰**
- CacheKey hash函数：djb2 → **FNV-1a**（碰撞率更低）
- GC：每10次GC打印完整状态checkpoint

### 5. `cache/aggregator.ts` — 团队聚合（4处改动）

- 场次加权：sqrt(count) → **log1p(count)**（更温和的场次效应）
- 维度权重：damage 0.28→0.26, kda 0.27→0.28, gold 0.18→0.19, tank 0.17→0.16, vision 0.10→0.11
- 置信度衰减：cbrt(min/3.5)×0.88 → **pow(min/3, 0.25)×0.86**（第四根）
- RingReducer：单次shift → while循环（防止窗口溢出）

### 6. `scheduler/index.ts` — 建议调度器（7处改动）

| 参数 | upstream | nexus-engine |
|------|---------|-------------|
| TTL | 200s | 180s |
| 衰减半衰期 | 55s | 50s |
| 最低相关性 | 0.10 | 0.12 |
| 批次冷却 | 2.5s | 2.0s |
| 紧急增益 | 1.35 | 1.40 |
| 阶段衰减混合 | 0.45+0.55×decay | 0.40+0.60×decay |
| burst阈值 | 6 | 5 |

### 7. `inference/index.ts` — 推理引擎（6处改动）

- 最低置信阈值：0.22→0.20
- 集成权重：0.65→0.62
- 心态预测：0.76+streak×0.03 → 0.74+streak×0.035
- 宏观策略(优)：0.50+delta×2.0 → 0.52+delta×1.8
- 宏观策略(劣)：0.48+|delta|×2.2 → 0.46+|delta|×2.4
- 模型版本：v3→v4

### 8. `decision/index.ts` — 决策协调器（5处改动）

- 反馈EMA alpha：0.20→0.22
- 融合温度：1.15→1.10
- 多样性惩罚：0.14→0.16
- 最小反馈样本：4→3
- 温度自适应系数：log2×0.1 → log2×0.08

### 9. `replay/index.ts` — 回放分析（3处改动）

- 标准化差值权重：kda 0.40→0.35, damage 0.30→0.35

### 10. `streaming/index.ts` — 流服务（2处改动）

- 消息历史容量：200→250
- 心跳间隔：30s→25s

### 11. `debug/run-pipeline.ts` — 模拟运行器（3处改动）

- 评分公式同步为ELU-logSinh
- 条件断点阈值：80→75

### 12-20. 其他模块保持结构不变

`capture`, `privacy-scrubber`, `abtest`, `profiling`, `observable`, `ontology/*`, `reactive/*` — 全部文件保留在mv中，结构完整。

---

## 调试工具使用指南

### 快速诊断

```bash
# 跑完整模拟管线——查看所有中间状态
npx tsx src/debug/run-pipeline.ts

# 在任意时刻dump引擎全量状态
npx tsx src/debug/dump-all.ts
```

### 在代码中插入"断点"

```typescript
import { introspector, StructWatcher } from './debug/introspector'

// 1. checkpoint——像 print 一样输出当前状态
introspector.checkpoint('myModule', 'after_scoring', {
  score: 42.5,
  kda: 3.2,
  allData: someObject
})

// 2. StructWatcher——追踪数据漂移
const watcher = new StructWatcher<{ hp: number; gold: number }>('player_state')
watcher.snap({ hp: 100, gold: 500 })   // 第一次快照
watcher.snap({ hp: 80, gold: 600 })    // 第二次快照 → 自动检测diff
watcher.printDiffs()                    // 打印所有变化

// 3. 条件断点——当条件满足时自动dump
introspector.addBreakpoint(
  'low_hp_alert',
  () => playerHp < 20,
  (intro) => {
    console.log('BREAKPOINT: HP too low!')
    intro.dumpFull()  // 全量状态转储
  }
)

// 4. 探针注册——随时可查
introspector.registerProbe('myModule', 'state', () => ({
  phase: currentPhase,
  queueSize: queue.length
}))

// 5. 查看所有注册探针状态
console.log(introspector.getAllProbeStates())
```

### 评分调试

```typescript
import { debugPrintScoringBreakdown } from './core/scoring'
import { debugPrintEngineState, debugPrintAdviceSummary } from './pipeline/engine'

// 打印评分每一步的公式和中间值
debugPrintScoringBreakdown(playerAnalysis, '测试玩家')

// 打印引擎完整状态（含tier热力图+内存估算）
debugPrintEngineState(engine)

// 打印建议矩阵（含置信度分布）
debugPrintAdviceSummary(advices)
```

### 运行时探针查询

```typescript
// 查看缓存命中率
introspector.getProbeState('cache:cache_stats')

// 查看调度器队列状态
introspector.getProbeState('scheduler:scheduler_state')

// 查看推理引擎统计
introspector.getProbeState('inference:inference_state')
```

### OSDK 模式对照

| OSDK 概念 | nexus-engine 对应 |
|-----------|------------------|
| Store (truth + optimistic layers) | NexusCacheLayers (truth + optimistic stack) |
| Changes + invalidation graph | introspector events + StructWatcher |
| BatchContext.write | NexusCacheLayers.writeTruth / writeOptimistic |
| Layers.remove (rollback) | NexusCacheLayers.removeOptimistic |
| WeakRefTrie / Canonicalizer | canonicalizeCacheKey (FNV-1a hash) |
| evaluateFilter (local predicate) | pipeline stages (local threshold evaluation) |
| RefCounts + GC | NexusRefCounts (with periodic checkpoint) |
