// Coach advisor template for in-game-send. Conforms to JSContextV1:
// getMetadata() -> { version, type }, getMessages(env) -> string[]

function getMetadata() {
  return { version: 1, type: 'ongoing-game' }
}

function ringReduce(dimensions) {
  var totalWeight = dimensions.reduce(function (s, d) { return s + d.weight }, 0)
  if (totalWeight === 0) return 0
  return dimensions.reduce(function (s, d) {
    return s + (d.value * d.weight) / totalWeight
  }, 0)
}

function analyzePlayerStrength(env, puuid) {
  var mh = env.matchHistory[puuid]
  if (!mh || !mh.data || mh.data.length === 0) return null

  var stats = env.playerStats
  if (!stats || !stats.players || !stats.players[puuid]) return null

  var analysis = stats.players[puuid]
  var summary = analysis.summary

  var score = ringReduce([
    { name: 'kda', weight: 2.0, value: Math.sqrt(summary.averageKda) * 1.44 },
    { name: 'winRate', weight: 1.5, value: (summary.winRate - 0.5) * 4 },
    { name: 'dmg', weight: 1.2, value: summary.averageDamageDealtToChampionShareToTop * 10 },
    { name: 'participation', weight: 1.0, value: summary.averageKillParticipationRate * 4 },
    { name: 'gold', weight: 0.8, value: summary.averageGoldShareToTop * 4 }
  ])

  return {
    puuid: puuid,
    score: score,
    winRate: summary.winRate,
    kda: summary.averageKda,
    count: summary.count,
    winningStreak: summary.winningStreak,
    losingStreak: summary.losingStreak
  }
}

function runCoachPipeline(env) {
  var messages = []
  var selfPuuid = env.selfPuuid

  // Stage 1: ally score pass
  var allyAnalyses = []
  var allyTotal = 0
  env.allyMembers.forEach(function (puuid) {
    var a = analyzePlayerStrength(env, puuid)
    if (a) {
      allyAnalyses.push(a)
      allyTotal += a.score
    }
  })

  // Stage 2: enemy score pass (extracted, analogous to CCCL histogram-only kernel)
  var enemyAnalyses = []
  var enemyTotal = 0
  env.enemyMembers.forEach(function (puuid) {
    var a = analyzePlayerStrength(env, puuid)
    if (a) {
      enemyAnalyses.push(a)
      enemyTotal += a.score
    }
  })

  // Stage 3: macro evaluation via ring-reduced score diff
  var allyAvg = allyAnalyses.length > 0 ? allyTotal / allyAnalyses.length : 0
  var enemyAvg = enemyAnalyses.length > 0 ? enemyTotal / enemyAnalyses.length : 0
  var diff = allyAvg - enemyAvg

  if (diff > 3) {
    messages.push('[教练] 我方整体实力占优，可以主动推进节奏!')
  } else if (diff < -3) {
    messages.push('[教练] 对方整体数据较好，建议稳住发育别浪')
  } else {
    messages.push('[教练] 双方实力接近，专注配合与执行!')
  }

  // Stage 4: enemy weakness detection
  var weakestEnemy = null
  enemyAnalyses.forEach(function (a) {
    if (a.winRate < 0.4 && a.count >= 5) {
      if (!weakestEnemy || a.winRate < weakestEnemy.winRate) {
        weakestEnemy = a
      }
    }
  })

  if (weakestEnemy) {
    var champId = env.championSelections[weakestEnemy.puuid]
    var champName = champId && env.gameData.champions[champId]
      ? env.gameData.champions[champId].name
      : '未知英雄'
    messages.push(
      '[教练] 对面' + champName + '近期胜率' +
      (weakestEnemy.winRate * 100).toFixed(0) + '%，可重点针对'
    )
  }

  // Stage 5: self streak analysis
  var selfAnalysis = analyzePlayerStrength(env, selfPuuid)
  if (selfAnalysis) {
    if (selfAnalysis.losingStreak >= 3) {
      messages.push('[教练] 你目前连败中，稳住心态打好自己的!')
    } else if (selfAnalysis.winningStreak >= 3) {
      messages.push('[教练] 连胜中! 保持这个状态!')
    }
  }

  // Stage 6: ally hot-streak highlight
  var hotAlly = null
  allyAnalyses.forEach(function (a) {
    if (a.puuid !== selfPuuid && a.winningStreak >= 3) {
      if (!hotAlly || a.winningStreak > hotAlly.winningStreak) {
        hotAlly = a
      }
    }
  })

  if (hotAlly) {
    var allyChampId = env.championSelections[hotAlly.puuid]
    var allyChampName = allyChampId && env.gameData.champions[allyChampId]
      ? env.gameData.champions[allyChampId].name
      : '队友'
    messages.push('[教练] ' + allyChampName + '正在' + hotAlly.winningStreak + '连胜，可以信赖!')
  }

  // Stage 7: premade detection on enemy side
  if (env.inferredPremadeTeams) {
    var found = false
    Object.keys(env.inferredPremadeTeams).forEach(function (teamSide) {
      var groups = env.inferredPremadeTeams[teamSide]
      groups.forEach(function (group) {
        if (group.length >= 3) {
          var isEnemy = group.some(function (p) {
            return env.enemyMembers.indexOf(p) !== -1
          })
          if (isEnemy && !found) {
            messages.push('[教练] 注意: 对方有' + group.length + '人组队，小心联动!')
            found = true
          }
        }
      })
    })
  }


  // Stage 8: lane matchup via champion win rate delta
  if (env.positionAssignments && env.championSelections) {
    var selfPos = env.positionAssignments[selfPuuid]
      ? env.positionAssignments[selfPuuid].position
      : null
    if (selfPos) {
      env.enemyMembers.forEach(function (puuid) {
        var enemyPos = env.positionAssignments[puuid]
          ? env.positionAssignments[puuid].position
          : null
        if (enemyPos === selfPos) {
          var enemyA = analyzePlayerStrength(env, puuid)
          if (enemyA && enemyA.winRate < 0.35 && enemyA.count >= 5) {
            var eName = env.championSelections[puuid] && env.gameData.champions[env.championSelections[puuid]]
              ? env.gameData.champions[env.championSelections[puuid]].name
              : '对线对手'
            messages.push('[教练] 你的对线' + eName + '近期胜率低，可积极打出优势')
          } else if (enemyA && enemyA.winRate > 0.65 && enemyA.count >= 5) {
            var eNameH = env.championSelections[puuid] && env.gameData.champions[env.championSelections[puuid]]
              ? env.gameData.champions[env.championSelections[puuid]].name
              : '对线对手'
            messages.push('[教练] 你的对线' + eNameH + '近期胜率高，对线需谨慎')
          }
        }
      })
    }
  }

  // Stage 9: composition damage type warning
  if (env.playerStats && env.playerStats.players) {
    var totalPhys = 0
    var totalMagic = 0
    var totalTrue = 0
    var compCount = 0
    env.allyMembers.forEach(function (puuid) {
      var a = env.playerStats.players[puuid]
      if (a && a.summary) {
        totalPhys += a.summary.averagePhysicalDamageDealtToChampionShareOfTeam
        totalMagic += a.summary.averageMagicDamageDealtToChampionShareOfTeam
        totalTrue += a.summary.averageTrueDamageDealtToChampionShareOfTeam
        compCount++
      }
    })
    if (compCount >= 3) {
      var avgPhys = totalPhys / compCount
      var avgMagic = totalMagic / compCount
      var avgTrue = totalTrue / compCount
      if (avgPhys > 0.7 && avgMagic < 0.2) {
        messages.push('[教练] 阵容物理伤害过高，注意穿甲装备选择')
      } else if (avgMagic > 0.7 && avgPhys < 0.2) {
        messages.push('[教练] 阵容魔法伤害过高，注意法穿装备')
      }
      if (avgTrue > 0.15) {
        messages.push('[教练] 对方真伤占比高，优先堆生命值而非护甲魔抗')
      }
    }
  }

  // Stage 10: gold efficiency comparison
  if (env.playerStats && env.playerStats.players) {
    var selfA = env.playerStats.players[selfPuuid]
    if (selfA && selfA.summary && selfA.summary.averageDamageGoldEfficiency < 0.6 && selfA.summary.count >= 5) {
      messages.push('[教练] 你的经济转化效率偏低，注意优化出装路线')
    }
  }

  // Stage 11: KDA trend and death analysis
  if (env.playerStats && env.playerStats.players) {
    var selfB = env.playerStats.players[selfPuuid]
    if (selfB && selfB.summary) {
      if (selfB.summary.averageKd < 1.0 && selfB.summary.count >= 5) {
        messages.push('[教练] 近期死亡偏多，注意走位和地图意识')
      }
      if (selfB.summary.kdaCv > 0.8 && selfB.summary.count >= 5) {
        messages.push('[教练] KDA波动大，表现不稳定，控制风险意识')
      }
    }
  }

  // Stage 12: win condition identification
  if (env.playerStats && env.playerStats.players) {
    var totalDmgWC = 0
    var totalKdaWC = 0
    var totalCsWC = 0
    var wcCount = 0
    env.allyMembers.forEach(function (puuid) {
      var a = env.playerStats.players[puuid]
      if (a && a.summary) {
        totalDmgWC += a.summary.averageDamageDealtToChampionShareToTop
        totalKdaWC += a.summary.averageKda
        totalCsWC += a.summary.averageCsPerMinute
        wcCount++
      }
    })
    if (wcCount >= 3) {
      var avgDmgWC = totalDmgWC / wcCount
      var avgKdaWC = totalKdaWC / wcCount
      var avgCsWC = totalCsWC / wcCount
      if (avgDmgWC > 0.75 && avgKdaWC > 3.0) {
        messages.push('[教练] 胜利条件: 团战输出，抓住机会打出伤害!')
      } else if (avgCsWC > 7.0 && avgDmgWC < 0.6) {
        messages.push('[教练] 胜利条件: 发育到后期，避免前期团战')
      }
    }
  }

  // Stage 13: CHERRY (arena) mode specific
  if (env.gameMode === 'CHERRY' || env.queueType === 'CHERRY') {
    messages.push('[教练] 斗魂竞技场: 优先选控制/爆发组合，增幅要匹配英雄特性')
    var selfC = env.playerStats && env.playerStats.players[selfPuuid]
    if (selfC && selfC.summary && selfC.summary.cherry && selfC.summary.cherry.count >= 3) {
      if (selfC.summary.cherry.winRate < 0.3) {
        messages.push('[教练] 近期竞技场胜率较低，尝试换英雄或增幅搭配')
      }
    }
  }

  return messages
}

function getMessages(env) {
  try {
    var startTs = Date.now()
    var messages = runCoachPipeline(env)
    var elapsed = Date.now() - startTs

    if (env.captureEnabled) {
      messages.push(
        '[实验] pipeline=' + elapsed + 'ms stages=13 samples=' +
        (messages.length - 1) + ' session=' + (env.captureSessionId || 'n/a')
      )
    }

    if (messages.length === 0) return ['[教练] 数据加载中...']
    return messages
  } catch (e) {
    return ['[教练] 分析出错: ' + (e.message || '未知错误')]
  }
}
