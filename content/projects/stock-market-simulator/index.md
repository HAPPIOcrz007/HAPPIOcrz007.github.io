# =(#1866E1)[link ➽=](https://github.com/HAPPIOcrz007/Stock-market-Edge-Simulator)

A high-performance stock exchange simulator written in =(danger)C++=, targeting =(accent)sub-microsecond= order matching latency through careful systems-level design.

## =(warn)Architecture=

- =(accent)Multithreaded matching engine= with lock-free order processing to eliminate contention on the hot path
- =(info)Memory-managed order book= following a small-pipe architecture — minimises cache misses and avoids dynamic allocation overhead during order flow
- =(warn)Small-pipe design= keeps working set in L1/L2 cache, reducing memory latency on each match cycle

## =(danger)OS-Level Optimisations=

- =(accent)CPU affinity= pins matching threads to dedicated cores, eliminating scheduler interference
- =(info)NUMA awareness= ensures memory allocations stay local to the CPU doing the work
- =(warn)Kernel bypass concepts= explored to reduce syscall overhead on the critical path

## =(#1866E1)Goals=

=(accent)Sub-microsecond= order matching latency on commodity hardware — demonstrating that careful memory layout and OS-level tuning matter as much as algorithm choice in latency-critical systems.

## =(warn)Stack=

`C++` · `Multithreading` · `Lock-free Structures` · `Linux` · `perf`