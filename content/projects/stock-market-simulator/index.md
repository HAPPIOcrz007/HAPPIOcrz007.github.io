# =(#1866E1)[link ➽=](https://github.com/HAPPIOcrz007/Stock-market-Edge-Simulator)

A high-performance stock exchange simulator written in =(#ff6b6b)C++=, targeting =(#2da44e)sub-microsecond= order matching latency through careful systems-level design.

## =(#f0a030)Architecture=

- =(#2da44e)Multithreaded matching engine= with lock-free order processing to eliminate contention on the hot path
- =(#58a6ff)Memory-managed order book= following a small-pipe architecture — minimises cache misses and avoids dynamic allocation overhead during order flow
- =(#f0a030)Small-pipe design= keeps working set in L1/L2 cache, reducing memory latency on each match cycle

## =(#ff6b6b)OS-Level Optimisations=

- =(#2da44e)CPU affinity= pins matching threads to dedicated cores, eliminating scheduler interference
- =(#58a6ff)NUMA awareness= ensures memory allocations stay local to the CPU doing the work
- =(#f0a030)Kernel bypass concepts= explored to reduce syscall overhead on the critical path

## =(#1866E1)Goals=

=(#2da44e)Sub-microsecond= order matching latency on commodity hardware — demonstrating that careful memory layout and OS-level tuning matter as much as algorithm choice in latency-critical systems.

## =(#f0a030)Stack=

`C++` · `Multithreading` · `Lock-free Structures` · `Linux` · `perf`