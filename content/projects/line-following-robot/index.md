# =(#1866E1)[link ➽=](https://github.com/HAPPIOcrz007/eLSI-Line-Following-Robot-team-168)

A high-performance line-following robot with =(#f0a030)PID control= and =(#2da44e)adaptive speed= modulation. Simulated in CoppeliaSim with real-time sensor fusion.

## =(#f0a030)Control System=

- =(#2da44e)PID controller= with KP=1.2, KI=0.02, KD=0.75 for smooth line tracking
- =(#58a6ff)Adaptive speed= — slow for sharp curves, fast for straights; linearly interpolated between BASE_SPEED (5.2) and TURN_SPEED (1.2)
- =(#ff6b6b)Real-time background detection= automatically switches between WHITE-BG (black line) and BLACK-BG (white line) with hysteresis

## =(#58a6ff)Recovery Logic=

- =(#2da44e)Grace period= during brief line loss with frozen heading (6 frames)
- =(#f0a030)In-place pivot search= for extended loss — true rotation recovery with anti-windup protection
- =(#1866E1)dt-corrected timing= ensures consistent behaviour regardless of loop jitter

## =(#ff6b6b)Sensor Fusion=

- 5-sensor array: left_corner, left, middle, right, right_corner
- =(#2da44e)Monotonic weights= [-2, -1, 0, 1, 2] for accurate position tracking
- =(#58a6ff)Background-normalised readings= with dropout filtering for robustness

## =(#f0a030)Stack=

`Python` · `PID Control` · `CoppeliaSim` · `ZMQ` · `Sensor Fusion` · `Real-Time Systems`