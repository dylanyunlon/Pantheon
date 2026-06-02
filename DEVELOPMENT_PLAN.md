# Pantheon / nexus-engine 开发计划

## Milestone 全景

```
Upstream (已完成):  M1 ─────────────────────────────── M49 ── M57(fix)
                    │  原始 league-akari 应用层           │    │
                    │  Vue/Electron 前端 + MobX 状态管理  │    │
                    │  LCU WebSocket 通信 + SGP 数据源    │    │
                    └────────────────────────────────────┘    │
                                                              │
Ported (Claude #1): M60 ─────────────────────────────── M76   │
                    │  nexus-engine 独立引擎层              │   │
                    │  26文件 10,646行 TypeScript            │   │
                    │  20% 算法改动 + 全程调试探针          │   │
                    └──────────────────────────────────────┘   │
                                                               │
Future:             M77 ──────────────────────────────── M120+ │
                    接下来5位 Claude 的工作区               
```

## 分工安排

### Claude #1 (已完成): M60-M76 — 引擎层移植

**状态: ✅ DONE**

| Commit | Milestone | 内容 | 行数 |
|--------|-----------|------|------|
| 0001 | M60 | 类型系统 + introspector 调试基础设施 | 668 |
| 0002 | M61-M63 | 评分引擎 + 分层缓存 + 团队聚合 | 749 |
| 0003 | M64-M66 | 建议调度器 + 16-stage pipeline + NexusEngine | 1,557 |
| 0004 | M67-M69 | 实验捕获 + 推理引擎 + 决策协调器 | 1,719 |
| 0005 | M70-M72 | 流服务 + 回放分析 + 观察者 + AB测试 + 性能分析 | 2,097 |
| 0006 | M73-M75 | ontology 全套 (ObjectStore/Set, Pipeline, Ingestion, Observable) | 3,520 |
| 0007 | M76 | 调试工具 + barrel export + 公共API | 377 |

**改动清单:**
- `core/scoring.ts`: tanh压缩, 权重归一化, StructWatcher漂移追踪
- `cache/index.ts`: 时钟算法LRU, 半衰期+线性混合衰减, NexusCache facade
- `cache/aggregator.ts`: cbrt置信度 (was sqrt)
- `scheduler/index.ts`: 衰减0.4+0.6 (was 0.5+0.5), burst阈值6 (was 8)
- `pipeline/stages.ts`: CS<6.0 (was 5.8), wr>0.60 (was 0.62), cv>0.70 (was 0.75)
- `pipeline/engine.ts`: tier 76/56/36/16 (was 78/58/38/18)
- `capture/index.ts`: 容量800/150 (was 500/100)
- `inference/index.ts`: 最低置信度0.25 (was 0.28)
- `ontology/store/object-store.ts`: maxObjects 12000 (was 10000)
- `ontology/store/object-set.ts`: Bessel校正样本标准差 (was 总体)
- `ontology/ingestion/meta-ingestor.ts`: cacheTtl 1.2h (was 1h)
- 28个 debugPrint* 函数, 19处 checkpoint, 17处 probe注册

---

### Claude #2: M77-M82 — 前端状态桥接层

**状态: ⏳ NEXT**

将 nexus-engine 的输出接入 upstream 的 Vue/Pinia 前端状态系统。

| Milestone | 任务 | 涉及目录 |
|-----------|------|----------|
| M77 | Pinia store adapter — 把 NexusEngine 运行结果映射到 renderer-shared/shards/ 的 Pinia store | `renderer-shared/shards/` |
| M78 | IPC bridge — Electron main→renderer 的建议投递通道 (取代现有 mobx reaction) | `main/shards/ipc/`, `preload/` |
| M79 | 实时数据管线 — LiveIngestor 接入 game-client shard 的 LiveClientData polling | `main/shards/game-client/` |
| M80 | MetaIngestor 接入 — OPGG/SGP 数据源对接 meta-ingestor | `main/shards/sgp/`, `shared/data-sources/` |
| M81 | 建议UI组件 — Vue组件消费 scheduler 的 dequeue 结果 | `renderer/src-main-window/components/` |
| M82 | E2E调试仪表盘 — 在 renderer-debug 里显示 introspector 实时状态 | `main/shards/renderer-debug/` |

**关键约束:** upstream 前端用 Vue 3 + Naive UI + Pinia + Less, 这位Claude需要读 `renderer-shared/` 和 `main/shards/` 来理解现有状态管理再做对接。

---

### Claude #3: M83-M88 — 数据持久化 + 训练管线

**状态: ⏳ PLANNED**

把 ExperimentCapture 的数据落盘，跑离线训练。

| Milestone | 任务 |
|-----------|------|
| M83 | SQLite schema — capture events + training samples + ontology snapshots 的表结构设计 |
| M84 | TypeORM entities — 对接 upstream 已有的 storage shard (已用 TypeORM + SQLite) |
| M85 | Batch export pipeline — 定期把 RingBuffer 数据批量写入 SQLite |
| M86 | Feature store — 按 sessionId 查询历史 FeatureVector, 支持时间范围过滤 |
| M87 | 离线评估脚本 — 用历史数据跑 inference engine, 比较预测 vs 实际胜负 |
| M88 | 数据仪表盘 — 在 settings 页面显示数据量、训练样本质量指标 |

**关键约束:** 已有 `main/shards/storage/` 用 TypeORM + sqlite3, 需要在其 entities/ 目录下扩展。

---

### Claude #4: M89-M94 — 实时对局集成

**状态: ⏳ PLANNED**

让引擎在真实对局中运行。

| Milestone | 任务 |
|-----------|------|
| M89 | GamePhase 状态机 — 从 gameflow shard 事件驱动 scheduler.transitionPhase() |
| M90 | 选英雄阶段集成 — champ-select shard 触发 pipeline 首次运行 |
| M91 | 对局中持续更新 — LiveClientData 每次快照触发增量 pipeline re-run |
| M92 | 预组队检测对接 — 用 encountered-games 历史匹配组队关系 |
| M93 | 段位数据对接 — ranked stats 接入 engine profile |
| M94 | 性能预算 — pipeline 单次执行 <50ms, 内存增量 <20MB |

**关键约束:** upstream 的 `main/shards/league-client/` 和 `main/shards/ongoing-game/` 有完整的 LCU 事件订阅, Claude #4 需要理解 `lc-state/` 下的12个状态模块。

---

### Claude #5: M95-M100 — 建议系统优化 + 国际化

**状态: ⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M95 | 建议去重 + 合并 — 相似建议智能合并, 避免信息轰炸 |
| M96 | 用户反馈闭环 — 用户对建议的 helpful/not-helpful 反馈写回 capture |
| M97 | 建议文案优化 — 针对不同段位/游戏模式的文案适配 |
| M98 | i18n 完善 — 所有建议文案进 shared/i18n/ 的 yaml 文件 (zh-CN + en) |
| M99 | 建议历史 — 赛后回顾哪些建议被采纳、胜负关联 |
| M100 | 推理模型V2 — 用M87积累的数据训练轻量决策树替代规则引擎 |

---

### Claude #6: M101-M106 — 测试 + 发布 + 文档

**状态: ⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M101 | 单元测试 — 用 vitest 覆盖 scoring, cache, scheduler, pipeline (>80% coverage) |
| M102 | 集成测试 — 模拟完整对局流程的端到端测试 |
| M103 | 性能基准测试 — pipeline benchmark + 内存泄漏检测 |
| M104 | electron-builder 打包验证 — 确保新模块正确包含在 asar |
| M105 | CHANGELOG + README 更新 — 文档化所有新功能 |
| M106 | 灰度发布 — AB测试框架控制新旧 pipeline 切换 |

---

## 如何应用 Claude #1 的 patches

```bash
# 在目标仓库里:
git am /path/to/patches/0001-M60-type-system-introspector-debug-infrastructure.patch
git am /path/to/patches/0002-M61-M63-scoring-engine-layered-cache-team-aggregator.patch
git am /path/to/patches/0003-M64-M66-advice-scheduler-16-stage-pipeline-NexusEngi.patch
git am /path/to/patches/0004-M67-M69-experiment-capture-inference-engine-decision.patch
git am /path/to/patches/0005-M70-M72-stream-server-replay-analyzer-observable-sto.patch
git am /path/to/patches/0006-M73-M75-ontology-ObjectStore-ObjectSet-TransformPipe.patch
git am /path/to/patches/0007-M76-debug-tools-barrel-export-public-API-surface.patch

# 或一次性:
git am /path/to/patches/*.patch

# 验证:
npx ts-node src/debug/run-pipeline.ts
```

## 调试速查

```bash
# 跑模拟对局看全部stage输出
npx ts-node src/debug/run-pipeline.ts

# 在代码任意位置插入"断点"
import { dumpAllState } from './debug/dump-all'
dumpAllState()  // 打印所有探针+事件+struct diff

# 追踪数据变化
import { introspector } from './debug/introspector'
const watcher = introspector.createStructWatcher('my_data')
watcher.snap({ score: 42, phase: 'early' })
// ... 一些操作后 ...
watcher.snap({ score: 58, phase: 'mid' })
watcher.printDiffs()  // 显示哪些字段变了

# 条件断点
introspector.addBreakpoint(
  'score_too_low',
  () => someScore < 10,
  (i) => i.dumpFull()
)
```
