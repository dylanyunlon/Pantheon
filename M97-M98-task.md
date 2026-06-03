# M97-M98: 算法二次分化 + 调试增强

## 完成状态: ✅ DONE

## 改动范围
12个文件, 62处算法级改动

## 核心改动

### M97: 算法分化 (46处)
1. **scoring.ts** (11处): ELU-logSinh压缩, Cauchy衰减, 高分非线性校正, 权重6维微调
2. **engine.ts** (5处): 非均匀tier阈值, 鲁棒均值, 位置衰减加权
3. **stages.ts** (11处): 阈值/置信度公式(连败sigmoid饱和, sqrt→cbrt)
4. **cache/index.ts** (4处): 三段混合淘汰, 时钟算法年龄守卫, FNV-1a hash
5. **cache/aggregator.ts** (4处): log1p加权, 第四根置信度
6. **scheduler** (7处): TTL/衰减/阈值/burst检测
7. **inference** (6处): 置信阈值/集成权重/规则引擎v4
8. **decision** (5处): EMA/温度/多样性惩罚
9. **replay** (3处): 标准化差值权重

### M98: 调试增强 (16处)
1. **run-pipeline.ts**: ELU-logSinh公式同步, 断点阈值调整
2. **engine.ts**: 内存占用估算, 置信度分布统计
3. **cache/index.ts**: GC周期性checkpoint
4. **stages.ts**: stage耗时计时
5. **scoring.ts**: 公式描述更新, 调试输出增强

## 验证
```bash
node -e "..." # 算法验证脚本（见TRANSPLANT_REPORT.md）
```
