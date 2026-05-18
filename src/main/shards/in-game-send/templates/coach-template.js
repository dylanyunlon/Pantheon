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

  return messages
}

function getMessages(env) {
  try {
    var messages = runCoachPipeline(env)
    if (messages.length === 0) return ['[教练] 数据加载中...']
    return messages
  } catch (e) {
    return ['[教练] 分析出错: ' + (e.message || '未知错误')]
  }
}
