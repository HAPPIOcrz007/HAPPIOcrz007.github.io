# 4×4 Register Read/Write Controller

A custom PCB implementing a 4×4 memory register array entirely from **74-series TTL ICs** — no microcontrollers, no FPGAs. Pure combinational and sequential logic.

## Design

- **PIPO (Parallel In, Parallel Out) architecture** for the register array
- **Synchronous read/write** with **asynchronous clear** — designed to mirror how real register files behave
- 74-series TTL chosen deliberately: every gate, every flip-flop is visible and traceable on the board

## Physical Interface

Engineered for hands-on learnability: input DIP switches, output LEDs, and clearly labelled control lines so students can probe the circuit and understand exactly what's happening at each clock edge.

## Recognition

- **Finalist** at the DOEEE Hardware Hackathon, MITWPU
- **Adopted by the college** as a recommended learning kit for junior-year students in digital electronics

## Stack

`74-Series TTL ICs` · `PCB Design` · `KiCad` · `Digital Electronics`