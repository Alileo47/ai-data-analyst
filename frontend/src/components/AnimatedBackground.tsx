import { createElement, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { tokens } from "../theme/tokens";

type DotConfig = {
  x: number;
  y: number;
  radius: number;
  velocityX: number;
  velocityY: number;
  breathOffset: number;
};

type Particle = DotConfig & {
  px: number;
  py: number;
};

const DOT_COUNT = 38;

const DOTS: DotConfig[] = Array.from({ length: DOT_COUNT }, (_, index) => {
  const column = index % 7;
  const row = Math.floor(index / 7);
  const stagger = row % 2 === 0 ? 0.018 : -0.018;

  return {
    x: 0.055 + column * 0.145 + stagger + ((index * 37) % 5) * 0.006,
    y: 0.075 + row * 0.158 + ((index * 29) % 7) * 0.008,
    radius: 3 + ((index * 5) % 4),
    velocityX: ((((index * 17) % 11) - 5) / 5) * 7.5,
    velocityY: ((((index * 13) % 9) - 4) / 4) * 6.5,
    breathOffset: index * 0.71,
  };
});

function createParticles(width: number, height: number): Particle[] {
  return DOTS.map((dot) => ({
    ...dot,
    px: dot.x * width,
    py: dot.y * height,
  }));
}

function resolveBoundary(particle: Particle, width: number, height: number) {
  if (particle.px - particle.radius < 0) {
    particle.px = particle.radius;
    particle.velocityX = Math.abs(particle.velocityX);
  } else if (particle.px + particle.radius > width) {
    particle.px = width - particle.radius;
    particle.velocityX = -Math.abs(particle.velocityX);
  }

  if (particle.py - particle.radius < 0) {
    particle.py = particle.radius;
    particle.velocityY = Math.abs(particle.velocityY);
  } else if (particle.py + particle.radius > height) {
    particle.py = height - particle.radius;
    particle.velocityY = -Math.abs(particle.velocityY);
  }
}

function resolveParticleCollisions(particles: Particle[]) {
  for (let aIndex = 0; aIndex < particles.length; aIndex += 1) {
    const a = particles[aIndex]!;

    for (let bIndex = aIndex + 1; bIndex < particles.length; bIndex += 1) {
      const b = particles[bIndex]!;
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const minimumDistance = a.radius + b.radius;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= minimumDistance * minimumDistance) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const normalX = distance > 0.0001 ? dx / distance : 1;
      const normalY = distance > 0.0001 ? dy / distance : 0;
      const overlap = minimumDistance - (distance > 0.0001 ? distance : 0);

      a.px -= normalX * overlap * 0.5;
      a.py -= normalY * overlap * 0.5;
      b.px += normalX * overlap * 0.5;
      b.py += normalY * overlap * 0.5;

      const relativeVelocityX = b.velocityX - a.velocityX;
      const relativeVelocityY = b.velocityY - a.velocityY;
      const velocityAlongNormal =
        relativeVelocityX * normalX + relativeVelocityY * normalY;

      if (velocityAlongNormal >= 0) {
        continue;
      }

      const restitution = 0.94;
      const impulse = (-(1 + restitution) * velocityAlongNormal) / 2;
      const impulseX = impulse * normalX;
      const impulseY = impulse * normalY;

      a.velocityX -= impulseX;
      a.velocityY -= impulseY;
      b.velocityX += impulseX;
      b.velocityY += impulseY;
    }
  }
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height } = useWindowDimensions();
  const androidDots = useRef(
    DOTS.map(() => ({
      position: new Animated.ValueXY({ x: 0, y: 0 }),
      opacity: new Animated.Value(tokens.motion.backgroundDotOpacity.min),
    })),
  ).current;

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const particles = createParticles(width, height);
    const opacityLoops: Animated.CompositeAnimation[] = [];
    androidDots.forEach((dot, index) => {
      const particle = particles[index]!;
      dot.position.setValue({ x: particle.px, y: particle.py });

      const opacityLoop = Animated.loop(
        Animated.sequence([
          Animated.delay((index * 170) % 1800),
          Animated.timing(dot.opacity, {
            toValue: tokens.motion.backgroundDotOpacity.max,
            duration: 2800 + (index % 5) * 650,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(dot.opacity, {
            toValue: tokens.motion.backgroundDotOpacity.min,
            duration: 3200 + (index % 4) * 700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      opacityLoops.push(opacityLoop);
      opacityLoop.start();
    });

    let frame = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.032);
      previousTime = time;

      for (const particle of particles) {
        particle.px += particle.velocityX * elapsed;
        particle.py += particle.velocityY * elapsed;
        resolveBoundary(particle, width, height);
      }
      resolveParticleCollisions(particles);

      particles.forEach((particle, index) => {
        androidDots[index]!.position.setValue({
          x: particle.px - particle.radius,
          y: particle.py - particle.radius,
        });
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      opacityLoops.forEach((loop) => loop.stop());
    };
  }, [androidDots, height, width]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const particles = createParticles(width, height);
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * pixelRatio);
      canvas.height = Math.round(bounds.height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.032);
      previousTime = time;

      for (const particle of particles) {
        particle.px += particle.velocityX * elapsed;
        particle.py += particle.velocityY * elapsed;
      }
      resolveParticleCollisions(particles);
      for (const particle of particles) {
        resolveBoundary(particle, width, height);
      }

      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        const breath =
          tokens.motion.backgroundDotOpacity.min +
          (tokens.motion.backgroundDotOpacity.max -
            tokens.motion.backgroundDotOpacity.min) *
            (0.5 + 0.5 * Math.sin(time * 0.00055 + particle.breathOffset));
        const color =
          index % 3 === 0
            ? tokens.colors.backgroundDotBlue
            : index % 3 === 1
              ? tokens.colors.backgroundDotViolet
              : tokens.colors.backgroundDot;

        context.beginPath();
        context.globalAlpha = breath;
        context.fillStyle = color;
        context.arc(particle.px, particle.py, particle.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [height, width]);

  if (Platform.OS === "web") {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {createElement("canvas", {
          ref: canvasRef,
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          },
        })}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {androidDots.map((dot, index) => {
        const radius = DOTS[index]!.radius;
        return (
          <Animated.View
            key={index}
            pointerEvents="none"
            style={[
              styles.dot,
              {
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                backgroundColor:
                  index % 3 === 0
                    ? tokens.colors.backgroundDotBlue
                    : index % 3 === 1
                      ? tokens.colors.backgroundDotViolet
                      : tokens.colors.backgroundDot,
                opacity: dot.opacity,
                transform: dot.position.getTranslateTransform(),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
  },
});
