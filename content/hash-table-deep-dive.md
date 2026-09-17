---
title: 深入理解哈希表：从哈希函数到开放寻址
slug: hash-table-deep-dive
tags: [数据结构, 算法, 哈希表]
excerpt: 从哈希函数设计、冲突解决策略到负载因子与扩容，系统梳理哈希表的核心原理与工程实现。
category: tech
published: true
date: 2026-08-13
---

# 深入理解哈希表：从哈希函数到开放寻址

哈希表（Hash Table）大概是工程师日常使用频率最高的数据结构——几乎所有主流语言的标准库都提供了它的实现（Java 的 `HashMap`、Rust 的 `HashMap`、Python 的 `dict`）。它以近乎 $O(1)$ 的均摊复杂度支持「键 → 值」的查询，是缓存、索引、去重、计数等场景的基石。

但「好用」和「理解它为什么好用」是两回事。本文从一个最小的问题出发，一步步拆解哈希表背后的设计权衡：哈希函数怎么写、冲突如何解决、负载因子如何影响性能、扩容又该如何优雅地完成。

## 1. 从一个朴素的想法说起

假设我们要存储一批 `(key, value)` 键值对，最直接的思路是用数组。

- **插入**：把键值对追加到数组末尾
- **查询**：遍历数组，比较 key 是否相等
- **删除**：找到后移除

查询和删除在最坏情况下需要遍历整个数组，复杂度是 $O(n)$。当数据量达到百万级别时，这显然不可接受。

哈希表的核心思想非常朴素：**把 key 映射成一个数组下标**，这样就能「一步到位」地定位元素。这个映射函数就是**哈希函数** $h$：

$$
\text{index} = h(\text{key}) \bmod m
$$

其中 $m$ 是数组（桶）的数量。理想情况下，如果 $h$ 能把不同的 key 均匀地散列到 $[0, m)$ 区间，查询就近似 $O(1)$。

## 2. 哈希函数的设计

### 2.1 什么是「好」的哈希函数

一个好的哈希函数需要满足三个性质：

1. **确定性**：同一个 key 永远得到同一个哈希值
2. **均匀性**：输出尽可能均匀地分布在 $[0, m)$ 上，避免「聚集」
3. **高效性**：计算本身要足够快，否则抵消了 $O(1)$ 的优势

一个常见的误区是把「哈希函数」和「加密哈希」混为一谈。哈希表里的哈希函数**不需要**抗碰撞、不需要雪崩效应达到密码学强度——很多人以为需要 ~~密码学强度的哈希~~，其实它只需要快且均匀。

### 2.2 经典的乘法哈希

乘法哈希（Multiplicative Hashing）是一个非常优雅的实现，只用一次乘法加一次移位：

```cpp
// 乘法哈希：h(k) = (k * A) 的小数部分 * m
uint32_t hash(uint32_t key, uint32_t m) {
    // 黄金比例常数 2^32 * 0.6180339887 ≈ 2654435769
    const uint32_t A = 2654435769u;
    return (key * A) >> (32 - 16); // 取高 16 位作为桶下标（假设 m = 2^16）
}
```

它利用了整型乘法溢出后「自然取模」的特性，配合黄金比例常数 $A = (\sqrt{5} - 1) / 2$，能让连续输入的 key 分散到不同桶，避免简单取模的聚集问题。

> 为什么直接 `key % m` 不够好？当 $m$ 是 $2$ 的幂时，`key % m` 等价于取 key 的低位，而低位往往有规律（比如偶数的 key 低位全是 0），会导致严重的聚集。

## 3. 冲突解决

当两个不同的 key 映射到同一个下标时，就发生了**冲突**（Collision）。由于桶的数量 $m$ 通常远小于 key 的数量，冲突是不可避免的，关键在于如何优雅地处理它。

### 3.1 链地址法（Separate Chaining）

链地址法的思路是：每个桶不再存一个元素，而是存一个链表（或更高效的结构），冲突的元素挂到同一根链上。

```python
class ChainedHashMap:
    def __init__(self, capacity=16):
        self.buckets = [[] for _ in range(capacity)]

    def _index(self, key):
        return hash(key) % len(self.buckets)

    def put(self, key, value):
        bucket = self.buckets[self._index(key)]
        for i, (k, _) in enumerate(bucket):
            if k == key:
                bucket[i] = (key, value)
                return
        bucket.append((key, value))

    def get(self, key):
        for k, v in self.buckets[self._index(key)]:
            if k == key:
                return v
        return None
```

Java 的 `HashMap` 在 JDK 8 之后就是「数组 + 链表 + 红黑树」的结构：当单条链长度超过阈值（默认 8）时，链表会**树化**成红黑树，把最坏情况从 $O(n)$ 拉回 $O(\log n)$。

### 3.2 开放寻址（Open Addressing）

开放寻址不引入额外的链表，所有元素都直接存在数组里。冲突时，按照一个**探测序列**依次寻找下一个空位：

| 探测方式 | 探测序列 | 优缺点 |
| --- | --- | --- |
| 线性探测 | $h(k) + i$ | 缓存友好，但容易「主聚集」 |
| 二次探测 | $h(k) + i^2$ | 缓解主聚集，但可能探测不到所有槽 |
| 双重哈希 | $h_1(k) + i \cdot h_2(k)$ | 分布均匀，但需要两个哈希函数 |

线性探测的代码非常简洁：

```rust
fn linear_probe_insert(table: &mut [Option<(u64, String)>], key: u64, value: String) {
    let m = table.len();
    let mut i = (key as usize) % m;
    loop {
        match &table[i] {
            None => { table[i] = Some((key, value)); return; }
            Some((k, _)) if *k == key => { table[i] = Some((key, value)); return; }
            _ => i = (i + 1) % m,
        }
    }
}
```

开放寻址对**负载因子**非常敏感，通常要求 $\alpha < 0.7$；而链地址法可以容忍 $\alpha > 1$。

## 4. 负载因子与扩容

负载因子（Load Factor）定义为：

$$
\alpha = \frac{n}{m}
$$

其中 $n$ 是已存元素数，$m$ 是桶数。$\alpha$ 越大，冲突越多，性能越差。对于链地址法，一次不成功查找的期望探测次数约为 $\alpha$；对于开放寻址的线性探测，期望探测次数会随着 $\alpha$ 趋近 1 而急剧上升：

$$
\frac{1}{2}\left(1 + \frac{1}{1 - \alpha}\right)
$$

当 $\alpha$ 超过阈值（常见 0.75）时，就需要**扩容**——分配一个更大的数组（通常是原来的 2 倍），然后对所有元素重新哈希。

### 4.1 渐进式 rehash

一次性 rehash 所有元素会导致明显的卡顿（对于 Redis 这类单线程服务尤其致命）。**渐进式 rehash** 把迁移分摊到多次操作中：

1. 分配新表，维护新旧两个哈希表
2. 每次查询/插入时，顺带迁移一小批旧表元素
3. 旧表清空后，切换到新表

```go
// 渐进式 rehash 的核心思路（伪代码）
func (d *Dict) rehashStep() {
    if d.rehashIdx == -1 { return }
    // 每次最多迁移 10 个槽位，避免单次操作过慢
    for i := 0; i < 10 && d.rehashIdx < len(d.ht[0].table); i++ {
        d.migrateBucket(d.rehashIdx)
        d.rehashIdx++
    }
    if d.rehashIdx >= len(d.ht[0].table) {
        d.ht[0] = d.ht[1] // 切换
        d.ht[1] = newHashTable()
        d.rehashIdx = -1
    }
}
```

Redis 的字典、Go 的 `map`、Java 的 `HashMap` 都采用了类似的思路（Java 在扩容时用高低位拆分，本质也是摊还）。

## 5. 一个完整的最小实现

下面用 TypeScript 实现一个支持链地址 + 扩容的哈希表，帮助你建立完整的心智模型：

```typescript
class HashMap<K, V> {
  private buckets: Array<Array<[K, V]>>;
  private size = 0;
  private readonly loadFactor = 0.75;

  constructor(private capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => []);
  }

  private hash(key: K): number {
    const str = String(key);
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0; // 31 进制多项式哈希
    }
    return h % this.buckets.length;
  }

  put(key: K, value: V): void {
    if (this.size / this.buckets.length >= this.loadFactor) this.resize();
    const bucket = this.buckets[this.hash(key)];
    for (const pair of bucket) {
      if (pair[0] === key) { pair[1] = value; return; }
    }
    bucket.push([key, value]);
    this.size++;
  }

  get(key: K): V | undefined {
    for (const [k, v] of this.buckets[this.hash(key)]) {
      if (k === key) return v;
    }
    return undefined;
  }

  private resize(): void {
    const old = this.buckets;
    this.buckets = Array.from({ length: old.length * 2 }, () => []);
    this.size = 0;
    for (const bucket of old) {
      for (const [k, v] of bucket) this.put(k, v);
    }
  }
}
```

## 6. 工程实践中的几个陷阱

> 哈希表的性能对哈希函数质量和负载因子的管理极度敏感。一个糟糕的哈希函数能让 $O(1)$ 退化成 $O(n)$，甚至引发拒绝服务。

- [x] 优先使用标准库的哈希表，不要自己造轮子（除非是学习或特殊需求）
- [x] 避免用不可控的外部输入作为哈希函数的「桶数量」依据，防止哈希碰撞 DoS
- [ ] 关注负载因子和扩容策略，特别是实时性敏感的场景
- [ ] 对于需要稳定遍历顺序的场景，考虑 `LinkedHashMap` 或有序容器

一个著名的工程案例是 **HashDoS**：攻击者构造大量哈希值相同的 key，让哈希表退化成链表，从而把服务打挂。这也是为什么 Java、Rust 等语言的哈希表默认使用带随机种子的哈希函数（如 SipHash）。

## 7. 小结

哈希表之所以高效，靠的不是某个神奇的算法，而是一整套**相互配合的工程权衡**：

1. **哈希函数**决定分布是否均匀
2. **冲突解决**决定退化时的底线
3. **负载因子**决定何时扩容
4. **扩容策略**决定摊还成本是否平滑

理解这些权衡，你就理解了为什么「几乎所有语言都有哈希表，但几乎没有两个实现是完全一样的」。

## 参考

- [OpenJDK HashMap 源码](https://openjdk.org/)
- [Redis dict 实现](https://github.com/redis/redis/blob/unstable/src/dict.c)
- 《算法导论》第 11 章「散列表」
