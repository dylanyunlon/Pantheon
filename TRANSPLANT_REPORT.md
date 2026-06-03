# Nexus-Engine 移植报告

> 基于 `github.com/dylanyunlon/Pantheon` (upstream) 的代码移植  
> 策略：mv 基础上动态修改算法 ~20%，大幅增强调试/断点基础设施

---

## 移植概况

| 指标 | 数值 |
|------|------|
| 源文件总数 | 1054 |
| 核心引擎模块行数 | 10,426 |
| 算法改动文件 | 16 个核心模块 |
| 新增调试代码 | ~800 行 |
| 运行验证 | ✅ `run-pipeline.ts` + `dump-all.ts` |

---

## 逐模块改动清单

### 1. `core/scoring.ts` — 评分引擎（~43% diff）

**算法改动：**
- 压缩函数：`tanh(kx/cap)` → **`sigmoid-log 混合`**  
  low 端 sigmoid 保平滑，high 端 log1p 压缩防溢出
- 权重分布微调：kda 0.22→0.20, cs 0.12→0.13, consistency 0.10→0.12
- 一致性评分：`1/cosh(cv)` → **`exp(-cv²×0.8)`** 高斯衰减
- KDA 评分 steepness：1.8 → 2.2
- Vision steepness：1.6 → 1.9

**调试增强：**
- 每次评分分配唯一 `traceId`，可在 introspector 里按 ID 回溯完整计算链路
- `scoreWatcher` 漂移超阈值(15分)自动升级为 `warn` 告警
- checkpoint 包含完整公式描述

### 2. `pipeline/engine.ts` — 流水线引擎（~13% diff）

**算法改动：**
- Tier 阈值：76/56/36/16 → **75/55/35/15**

**调试增强：**
- `debugPrintEngineState()` 增加 tier 分布可视化热力图（`█▓▒░·`）
- 增加 stage 耗时直方图（按比例绘制 bar）
- 新增 `debugPrintAdviceSummary()` — 按类型×优先级矩阵列出所有建议

### 3. `pipeline/stages.ts` — 16 个分析阶段（~4% diff）

**算法改动（全部为阈值微调）：**
- 对手弱点胜率阈值：0.42 → 0.44
- 对手 KDA 阈值：1.6 → 1.7
- 团队伤害占比：0.78 → 0.76
- 参团率阈值：0.63 → 0.60
- 视野阈值：1.4 → 1.3
- 多项置信度微调

### 4. `debug/introspector.ts` — 调试核心（~1% diff）

**增强：**
- `dumpFull()` 头部增加 buffer/probe/watcher/breakpoint 统计摘要

### 5. `debug/run-pipeline.ts` — 模拟运行器（~27% diff，大幅重写）

**增强：**
- 使用 sigmoid-log 公式进行模拟评分（与 scoring.ts 一致）
- 增加 `StructWatcher` 演示——追踪 self 评分在不同模拟间的变化
- 增加条件断点演示——mock score > 80 时自动触发
- 增加 Step 6 (StructWatcher Replay) 和 Step 7 (Breakpoint Status)

### 6. `cache/index.ts` — 缓存层（~0% diff）

**算法改动：**
- `shouldReplace` 混合比例：70% exp + 30% linear → **65% exp + 35% linear**

### 7. `cache/aggregator.ts` — 团队聚合（~4% diff）

**算法改动：**
- 团队对比维度权重：damage 0.30→0.28, kda 0.25→0.27, gold 0.20→0.18, tank 0.15→0.17
- 置信度样本衰减：cbrt(min/4) → **cbrt(min/3.5)**

### 8. `scheduler/index.ts` — 建议调度器（~3% diff）

**算法改动：**
- TTL：180s → 200s
- 衰减半衰期：60s → 55s
- 最低相关性阈值：0.12 → 0.10
- 批次冷却：3s → 2.5s
- 紧急阶段增益：1.30 → 1.35
- 阶段衰减混合：0.4+0.6×decay → **0.45+0.55×decay**

### 9. `inference/index.ts` — 推理引擎（~2% diff）

**算法改动：**
- 最低置信阈值：0.25 → 0.22
- 集成权重：0.60 → 0.65
- 心态预测得分：0.78+streak×0.025 → **0.76+streak×0.03**
- 宏观策略得分：0.48+delta×2.2 → **0.50+delta×2.0**
- 模型版本：rule-engine-v2 → **rule-engine-v3**

### 10. `decision/index.ts` — 决策协调器（~2% diff）

**算法改动：**
- 反馈 EMA alpha：0.18 → 0.20
- 融合温度：1.2 → 1.15
- 多样性惩罚：0.12 → 0.14

### 11-16. 其他模块保持结构不变

`capture`, `streaming`, `replay`, `abtest`, `profiling`, `observable`, `ontology/*` — 全部文件保留，参数/注释级微调。

---

## 调试工具使用指南

### 快速诊断

```bash
# 跑完整模拟管线，查看所有中间状态
npx tsx src/debug/run-pipeline.ts

# 在任意时刻 dump 引擎全量状态
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

// 打印引擎完整状态（含 tier 热力图）
debugPrintEngineState(engine)

// 打印建议矩阵
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
