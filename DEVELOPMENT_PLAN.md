# Pantheon / nexus-engine 开发计划

## 分工安排

### Claude #1 (完成): M60-M76, M83-M84 — 引擎层移植 + 算法改动
**✅ DONE** — 26文件 10,646行. 16-stage pipeline, scoring, cache, scheduler, capture, inference, decision, streaming, replay, A/B test, profiling, ontology. 20% sigmoid-log/Gaussian/权重算法改动.

### Claude #2 (完成): M85-M88 — 反应式瞬时决策层
**✅ DONE** — ReactiveStore + IncrementalPipeline + OptimisticAdvisor. OSDK-pattern Layer/Subject/Batch.

### Claude #3 (完成): M89-M94 — 实时对局集成
**✅ DONE** — 6文件 ~1,800行. 将reactive层接入upstream游戏数据流.

| Milestone | 内容 |
|-----------|------|
| M89 | ReactiveStore: NexusLayer链 + NexusLayers(truth+optimistic) + NexusSubject + NexusBatchContext + NexusRefCounts(microtask GC) |
| M90 | IncrementalPipeline: stage声明数据依赖 → dirty-only re-run → skip rate 25-75% |
| M91 | OptimisticAdvisor: hover→乐观预测→lock确认/dodge回滚 + debounce + stale purge |
| M92 | GameBridge: GameflowPhase映射 + ChampSelect→OptimisticAdvisor + LiveClientData→batch + PlayerStats→batch + PremadeTeams→store |
| M93 | barrel export: 30+新导出到公共API |
| M94 | run-reactive.ts: 完整5阶段对局模拟 (Lobby→ChampSelect→Loading→InProgress→PostGame) |

架构改进:
- OLD: data → 16-stage full pipeline → scheduler → dequeue → UI (~200ms+)
- NEW: data → Store.write() → Subject.next() → subscriber (~0ms)
- GameBridge: upstream MobX → ReactiveStore keys (game:phase, player:X:analysis, champion:X, live:*)
- Incremental: 数据变了只跑dirty stages (跳过clean)
- Optimistic: hover时就出建议, lock后验证

### Claude #4 (下一步): M95-M100 — 数据持久化 + 训练管线
**⏳ NEXT**

| Milestone | 任务 |
|-----------|------|
| M95 | SQLite schema: capture events + training samples + reactive store snapshots |
| M96 | TypeORM entities 对接 upstream storage shard |
| M97 | Batch export: RingBuffer → SQLite 定期写入 |
| M98 | Feature store: 按sessionId查询历史FeatureVector |
| M99 | 离线评估: 历史数据跑inference, 比较预测vs胜负 |
| M100 | 数据仪表盘: settings页面显示数据量和样本质量 |

### Claude #5: M101-M106 — 建议优化 + i18n
**⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M101 | 建议去重+合并 |
| M102 | 用户反馈闭环 (helpful/not-helpful) |
| M103 | 文案段位适配 |
| M104 | i18n (zh-CN + en yaml) |
| M105 | 建议历史回顾 |
| M106 | 推理模型V2 |

### Claude #6: M107-M112 — 测试 + 发布
**⏳ PLANNED**

| Milestone | 任务 |
|-----------|------|
| M107 | vitest单元测试 (>80% coverage) |
| M108 | 集成测试 |
| M109 | 性能基准 |
| M110 | electron-builder打包 |
| M111 | CHANGELOG + README |
| M112 | AB灰度发布 |

## 调试速查

```bash
npx tsx src/debug/run-pipeline.ts     # 旧pipeline模拟
npx tsx src/reactive/run-reactive.ts  # 反应式全对局模拟
npx tsx src/debug/dump-all.ts         # 全量状态dump
```
