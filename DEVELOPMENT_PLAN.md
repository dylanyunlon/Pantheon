# Pantheon / nexus-engine 开发计划

## 分工安排

### Claude #1 (完成): M60-M84 — 引擎层移植 + 算法改动
**✅ DONE** — 26文件 10,646行. 16-stage pipeline, scoring, cache, scheduler, capture, inference, decision, streaming, replay, A/B test, profiling, ontology. 20% sigmoid-log/Gaussian/权重算法改动.

### Claude #2 (完成): M85-M88 — 反应式瞬时决策层
**✅ DONE** — ReactiveStore + IncrementalPipeline + OptimisticAdvisor. OSDK-pattern Layer/Subject/Batch.

### Claude #3 (完成): M89-M94 — 实时对局集成
**✅ DONE** — 6文件 ~1,800行. 将reactive层接入upstream游戏数据流.

### Claude #4 (完成): M95-M96 — OSDK算法层
**✅ DONE** — Trie canonicalization, structural dedup, filter evaluator, invalidation graph.

### Claude #5 (完成): M97-M98 — 算法二次分化 + 调试增强
**✅ DONE** — 12文件 62处算法改动. 公式级改动(非字符串替换):
- scoring: sigmoid-log → ELU-logSinh, 高斯 → Cauchy衰减, 高分非线性校正
- engine: 均匀tier → 非均匀间距, 算术均值 → 鲁棒均值(去头尾), 位置衰减加权
- stages: 11处阈值/置信度公式(连败sigmoid饱和, sqrt→cbrt置信度)
- cache: 2段混合 → 3段(exp+linear+cosine), 时钟算法年龄守卫, djb2→FNV-1a
- aggregator: sqrt→log1p加权, cbrt→第四根置信度
- scheduler/inference/decision/replay/streaming: 37处参数调优
- debug: 条件断点/StructWatcher漂移告警/内存估算/置信度分布

### Claude #6 (下一步): M99-M104 — 数据持久化 + 训练管线
**⏳ NEXT**

| Milestone | 任务 |
|-----------|------|
| M99 | SQLite schema: capture events + training samples + reactive store snapshots |
| M100 | TypeORM entities 对接 upstream storage shard |
| M101 | Batch export: RingBuffer → SQLite 定期写入 |
| M102 | Feature store: 按sessionId查询历史FeatureVector |
| M103 | 离线评估: 历史数据跑inference, 比较预测vs胜负 |
| M104 | 数据仪表盘: settings页面显示数据量和样本质量 |

### Claude #7: M105-M110 — 建议优化 + i18n
**⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M105 | 建议去重+合并: 同类advice在调度器层面聚合 |
| M106 | 用户反馈闭环: helpful/not-helpful → FeedbackWeightAdapter |
| M107 | 文案段位适配: 根据自身段位调整建议措辞 |
| M108 | i18n: zh-CN + en yaml, 运行时切换 |
| M109 | 建议历史回顾: 上一局建议vs实际结果对比面板 |
| M110 | 推理模型V2: 多目标预测(胜率+MVP概率+carry指数) |

### Claude #8: M111-M116 — 对局中实时建议
**⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M111 | LiveIngestor实时数据流: 击杀/死亡/目标事件 → 增量pipeline |
| M112 | 实时建议投递: 基于game-bridge的OSD通知 |
| M113 | 小地图热力图: 基于DerivedTimeSeries的风险区域标注 |
| M114 | 装备建议: 根据对手阵容动态推荐出装 |
| M115 | 回放分析V2: 时间轴回放+关键决策点标注 |
| M116 | 性能优化: pipeline skip-rate目标>50% |

### Claude #9: M117-M122 — 测试 + 发布
**⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M117 | vitest单元测试: 核心模块>80% coverage |
| M118 | 集成测试: mock对局端到端 |
| M119 | 性能基准: pipeline延迟p50<5ms p99<20ms |
| M120 | electron-builder打包 |
| M121 | CHANGELOG + README |
| M122 | AB灰度发布: 新算法vs旧算法对照实验 |

### Claude #10: M123-M128 — 社区版 + 多游戏
**⏳ FUTURE**

| Milestone | 任务 |
|-----------|------|
| M123 | 插件系统: 自定义stage注册 |
| M124 | 社区建议贡献: stage marketplace |
| M125 | Valorant适配: 游戏桥接层抽象 |
| M126 | TFT(云顶)适配 |
| M127 | 数据可视化大屏: 多维度玩家画像 |
| M128 | WebSocket远程调试: 手机端查看引擎状态 |

---

## 调试速查

```bash
npx tsx src/debug/run-pipeline.ts     # 旧pipeline模拟
npx tsx src/reactive/run-reactive.ts  # 反应式全对局模拟
npx tsx src/debug/dump-all.ts         # 全量状态dump
```

## OSDK 模式对照

| OSDK 概念 | nexus-engine 对应 |
|-----------|------------------|
| Store (truth + optimistic layers) | NexusCacheLayers (truth + optimistic stack) |
| Changes + invalidation graph | introspector events + StructWatcher |
| BatchContext.write | NexusCacheLayers.writeTruth / writeOptimistic |
| Layers.remove (rollback) | NexusCacheLayers.removeOptimistic |
| WeakRefTrie / Canonicalizer | canonicalizeCacheKey (FNV-1a hash) |
| evaluateFilter (local predicate) | pipeline stages (local threshold evaluation) |
| RefCounts + GC | NexusRefCounts (with periodic checkpoint) |
