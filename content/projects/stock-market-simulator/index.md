# [link ➽](https://github.com/HAPPIOcrz007/Stock-market-Edge-Simulator)
A high-performance stock exchange simulator written in **C++**, targeting sub-microsecond order matching latency through careful systems-level design.

## Architecture

- **Multithreaded matching engine** with lock-free order processing to eliminate contention on the hot path
- **Memory-managed order book** following a small-pipe architecture — minimises cache misses and avoids dynamic allocation overhead during order flow
- **Small-pipe design** keeps working set in L1/L2 cache, reducing memory latency on each match cycle

## OS-Level Optimisations

- **CPU affinity** pins matching threads to dedicated cores, eliminating scheduler interference
- **NUMA awareness** ensures memory allocations stay local to the CPU doing the work
- **Kernel bypass concepts** explored to reduce syscall overhead on the critical path

## Goals

Sub-microsecond order matching latency on commodity hardware — demonstrating that careful memory layout and OS-level tuning matter as much as algorithm choice in latency-critical systems.

## Stack

`C++` · `Multithreading` · `Lock-free Structures` · `Linux` · `perf`