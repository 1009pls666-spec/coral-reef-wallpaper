package com.soobin.coralreef;

import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.SurfaceHolder;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

public class ReefWallpaperService extends WallpaperService {
    @Override
    public Engine onCreateEngine() {
        return new ReefEngine();
    }

    private final class ReefEngine extends Engine {
        private static final long FRAME_MS = 33L;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final Random random = new Random();
        private final Paint bitmapPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint overlayPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bubblePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final List<Swimmer> swimmers = new ArrayList<>();
        private final List<Bubble> bubbles = new ArrayList<>();
        private final float[] mesh = new float[(4 + 1) * (2 + 1) * 2];
        private final SharedPreferences preferences;

        private Bitmap background;
        private Bitmap[] smallFish;
        private Bitmap whale;
        private Bitmap shark;
        private Bitmap turtle;
        private Bitmap jelly;
        private boolean visible;
        private int width;
        private int height;
        private int configuredCount;
        private float speedMultiplier = 1f;
        private float horizontalOffset = .5f;
        private long lastFrameNanos;
        private long lastPreferenceRead;

        private final Runnable renderFrame = new Runnable() {
            @Override public void run() {
                drawFrame();
            }
        };

        ReefEngine() {
            preferences = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        }

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);
            setTouchEventsEnabled(true);
            setOffsetNotificationsEnabled(true);
            loadBitmaps();
            readPreferences(true);
        }

        private void loadBitmaps() {
            background = decode(R.drawable.reef_mobile);
            smallFish = new Bitmap[] {
                decode(R.drawable.blue_tang),
                decode(R.drawable.yellow_tang),
                decode(R.drawable.clownfish),
                decode(R.drawable.bannerfish),
                decode(R.drawable.butterflyfish),
                decode(R.drawable.silver_tang)
            };
            whale = decode(R.drawable.humpback_whale);
            shark = decode(R.drawable.reef_shark);
            turtle = decode(R.drawable.sea_turtle);
            jelly = decode(R.drawable.jellyfish);
        }

        private Bitmap decode(int resource) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inScaled = false;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeResource(getResources(), resource, options);
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int nextWidth, int nextHeight) {
            super.onSurfaceChanged(holder, format, nextWidth, nextHeight);
            width = nextWidth;
            height = nextHeight;
            resetScene();
            lastFrameNanos = 0L;
            drawFrame();
        }

        @Override
        public void onVisibilityChanged(boolean nextVisible) {
            visible = nextVisible;
            handler.removeCallbacks(renderFrame);
            if (visible) {
                lastFrameNanos = 0L;
                drawFrame();
            }
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            visible = false;
            handler.removeCallbacks(renderFrame);
            super.onSurfaceDestroyed(holder);
        }

        @Override
        public void onDestroy() {
            handler.removeCallbacks(renderFrame);
            swimmers.clear();
            bubbles.clear();
            super.onDestroy();
        }

        @Override
        public void onOffsetsChanged(float xOffset, float yOffset, float xOffsetStep,
                                     float yOffsetStep, int xPixelOffset, int yPixelOffset) {
            horizontalOffset = xOffset;
        }

        @Override
        public void onTouchEvent(MotionEvent event) {
            if (event.getAction() != MotionEvent.ACTION_UP || width <= 0) return;
            Swimmer nearest = null;
            float nearestDistance = Float.MAX_VALUE;
            for (Swimmer swimmer : swimmers) {
                if (!swimmer.interactive || swimmer.depth < .2f) continue;
                float dx = event.getX() - swimmer.x;
                float dy = event.getY() - swimmer.currentY(height);
                float distance = dx * dx + dy * dy;
                float hitRadius = Math.max(width * swimmer.size * .7f, width * .07f);
                if (distance < hitRadius * hitRadius && distance < nearestDistance) {
                    nearest = swimmer;
                    nearestDistance = distance;
                }
            }
            if (nearest != null) {
                nearest.boost = nearest.kind == Kind.WHALE ? 1.1f : nearest.kind == Kind.SHARK ? 1.8f : 3.6f;
                nearest.phase += .7f;
                addBubbles(event.getX(), event.getY(), 3);
            } else {
                addBubbles(event.getX(), event.getY(), 10);
            }
        }

        private void readPreferences(boolean forceReset) {
            int nextCount = Math.max(6, Math.min(22, preferences.getInt(MainActivity.COUNT, 11)));
            int speed = Math.max(0, Math.min(100, preferences.getInt(MainActivity.SPEED, 52)));
            speedMultiplier = .55f + speed / 100f * 1.25f;
            if (forceReset || nextCount != configuredCount) {
                configuredCount = nextCount;
                resetScene();
            }
        }

        private void resetScene() {
            if (width <= 0 || height <= 0 || smallFish == null) return;
            swimmers.clear();
            swimmers.add(make(whale, Kind.WHALE, .25f, .056f, .13f, .18f, false));
            swimmers.add(make(shark, Kind.SHARK, .48f, .029f, .34f, .40f, true));
            swimmers.add(make(turtle, Kind.TURTLE, .29f, .021f, .72f, .82f, true));
            swimmers.add(make(jelly, Kind.JELLY, .20f, .012f, .52f, .66f, true));
            for (int index = swimmers.size(); index < configuredCount; index++) {
                Bitmap fish = smallFish[random.nextInt(smallFish.length)];
                float depth = .28f + random.nextFloat() * .68f;
                // Match the larger web baseline while retaining depth variation.
                float size = (.132f + random.nextFloat() * .149f) * (.72f + depth * .40f);
                float speed = .035f + random.nextFloat() * .047f;
                swimmers.add(make(fish, Kind.FISH, size, speed, depth,
                    .18f + random.nextFloat() * .68f, random.nextBoolean()));
            }
            swimmers.sort(Comparator.comparingDouble(value -> value.depth));
        }

        private Swimmer make(Bitmap bitmap, Kind kind, float size, float speed,
                             float depth, float lane, boolean facingRight) {
            Swimmer swimmer = new Swimmer();
            swimmer.bitmap = bitmap;
            swimmer.kind = kind;
            swimmer.size = size;
            swimmer.baseSpeed = speed;
            swimmer.depth = depth;
            swimmer.lane = lane;
            swimmer.facingRight = facingRight;
            swimmer.phase = random.nextFloat() * 10f;
            swimmer.mood = random.nextFloat() * 8f;
            swimmer.wave = .008f + random.nextFloat() * .018f;
            swimmer.tailRate = kind == Kind.SHARK ? 7.3f : kind == Kind.WHALE ? 1.7f :
                kind == Kind.TURTLE ? 2.2f : kind == Kind.JELLY ? 2.5f : 3.3f + random.nextFloat() * 4f;
            float margin = width * size;
            swimmer.x = -margin + random.nextFloat() * (width + margin * 2f);
            swimmer.interactive = depth >= .24f;
            return swimmer;
        }

        private void drawFrame() {
            handler.removeCallbacks(renderFrame);
            if (!visible || width <= 0 || height <= 0) return;

            long now = System.nanoTime();
            float dt = lastFrameNanos == 0L ? 1f / 30f : Math.min(.05f, (now - lastFrameNanos) / 1_000_000_000f);
            lastFrameNanos = now;
            if (System.currentTimeMillis() - lastPreferenceRead > 1800L) {
                lastPreferenceRead = System.currentTimeMillis();
                readPreferences(false);
            }

            update(dt);
            Canvas canvas = null;
            try {
                canvas = getSurfaceHolder().lockCanvas();
                if (canvas != null) render(canvas);
            } finally {
                if (canvas != null) getSurfaceHolder().unlockCanvasAndPost(canvas);
            }
            if (visible) handler.postDelayed(renderFrame, FRAME_MS);
        }

        private void update(float dt) {
            for (Swimmer swimmer : swimmers) {
                if (swimmer.kind == Kind.WHALE && swimmer.passCooldown > 0f) {
                    swimmer.passCooldown = Math.max(0f, swimmer.passCooldown - dt);
                    continue;
                }
                swimmer.phase += dt * swimmer.tailRate;
                float personality = .82f + .25f * (float) Math.sin(swimmer.phase * .17f + swimmer.mood);
                float boostFactor = 1f + swimmer.boost;
                float pixelsPerSecond = width * swimmer.baseSpeed * personality * boostFactor * speedMultiplier;
                swimmer.x += (swimmer.facingRight ? 1f : -1f) * pixelsPerSecond * dt;
                swimmer.boost = Math.max(0f, swimmer.boost - dt * (swimmer.kind == Kind.WHALE ? .45f : .92f));

                float fishWidth = width * swimmer.size;
                if (swimmer.facingRight && swimmer.x > width + fishWidth) {
                    respawn(swimmer, false);
                    if (swimmer.kind == Kind.WHALE) swimmer.passCooldown = 4f;
                }
                if (!swimmer.facingRight && swimmer.x < -fishWidth) {
                    respawn(swimmer, true);
                    if (swimmer.kind == Kind.WHALE) swimmer.passCooldown = 4f;
                }
            }

            for (int first = 0; first < swimmers.size(); first++) {
                Swimmer a = swimmers.get(first);
                if (a.kind != Kind.FISH) continue;
                for (int second = first + 1; second < swimmers.size(); second++) {
                    Swimmer b = swimmers.get(second);
                    if (b.kind != Kind.FISH) continue;
                    if (Math.abs(a.x - b.x) < width * .08f && Math.abs(a.lane - b.lane) < .045f) {
                        a.lane = clamp(a.lane - dt * .018f, .13f, .88f);
                        b.lane = clamp(b.lane + dt * .018f, .13f, .88f);
                    }
                }
            }

            Iterator<Bubble> iterator = bubbles.iterator();
            while (iterator.hasNext()) {
                Bubble bubble = iterator.next();
                bubble.life -= dt;
                bubble.y -= bubble.speed * dt;
                bubble.phase += dt * 2.2f;
                bubble.x += Math.sin(bubble.phase) * width * .006f * dt;
                if (bubble.life <= 0f || bubble.y + bubble.radius < 0f) iterator.remove();
            }
        }

        private void respawn(Swimmer swimmer, boolean fromRight) {
            float fishWidth = width * swimmer.size;
            swimmer.x = fromRight ? width + fishWidth * (.7f + random.nextFloat()) : -fishWidth * (.7f + random.nextFloat());
            swimmer.lane = clamp(swimmer.lane + (random.nextFloat() - .5f) * .22f, .12f, .90f);
            swimmer.mood = random.nextFloat() * 8f;
        }

        private void render(Canvas canvas) {
            drawBackground(canvas);
            for (Swimmer swimmer : swimmers) drawSwimmer(canvas, swimmer);
            drawBubbles(canvas);
            drawCameraFinish(canvas);
        }

        private void drawBackground(Canvas canvas) {
            if (background == null) {
                canvas.drawColor(Color.rgb(0, 112, 154));
                return;
            }
            float scale = Math.max(width / (float) background.getWidth(), height / (float) background.getHeight());
            float drawnWidth = background.getWidth() * scale;
            float drawnHeight = background.getHeight() * scale;
            float parallax = (horizontalOffset - .5f) * Math.max(0f, drawnWidth - width) * .7f;
            float left = (width - drawnWidth) * .5f - parallax;
            float top = (height - drawnHeight) * .5f;
            canvas.drawBitmap(background, null, new RectF(left, top, left + drawnWidth, top + drawnHeight), bitmapPaint);

            overlayPaint.setShader(new LinearGradient(0, 0, 0, height,
                new int[] { 0x16E9FFFF, 0x0000B5D6, 0x36001838 },
                new float[] { 0f, .48f, 1f }, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, width, height, overlayPaint);
            overlayPaint.setShader(null);
        }

        private void drawSwimmer(Canvas canvas, Swimmer swimmer) {
            if (swimmer.kind == Kind.WHALE && swimmer.passCooldown > 0f) return;
            Bitmap bitmap = swimmer.bitmap;
            if (bitmap == null) return;
            float drawWidth = width * swimmer.size;
            float drawHeight = drawWidth * bitmap.getHeight() / bitmap.getWidth();
            float centerY = swimmer.currentY(height);
            float pulse = swimmer.kind == Kind.JELLY ? 1f + .045f * (float) Math.sin(swimmer.phase) : 1f;

            bitmapPaint.setAlpha(Math.round(190 + swimmer.depth * 65));
            canvas.save();
            canvas.translate(swimmer.x, centerY);
            if (!swimmer.facingRight) canvas.scale(-1f, 1f);
            canvas.scale(drawWidth / bitmap.getWidth(), drawHeight * pulse / bitmap.getHeight());
            canvas.translate(-bitmap.getWidth() / 2f, -bitmap.getHeight() / 2f);

            if (swimmer.kind == Kind.JELLY) {
                canvas.drawBitmap(bitmap, 0, 0, bitmapPaint);
            } else {
                buildMesh(bitmap, swimmer);
                canvas.drawBitmapMesh(bitmap, 4, 2, mesh, 0, null, 0, bitmapPaint);
            }
            canvas.restore();
            bitmapPaint.setAlpha(255);
        }

        private void buildMesh(Bitmap bitmap, Swimmer swimmer) {
            int offset = 0;
            float tailSwing = (float) Math.sin(swimmer.phase) * bitmap.getHeight() *
                (swimmer.kind == Kind.SHARK ? .028f : swimmer.kind == Kind.WHALE ? .018f : .035f);
            for (int row = 0; row <= 2; row++) {
                for (int column = 0; column <= 4; column++) {
                    float x = bitmap.getWidth() * column / 4f;
                    float y = bitmap.getHeight() * row / 2f;
                    float tailWeight = column == 0 ? 1f : column == 1 ? .36f : 0f;
                    float verticalShape = row == 1 ? 1f : .58f;
                    mesh[offset++] = x;
                    mesh[offset++] = y + tailSwing * tailWeight * verticalShape;
                }
            }
        }

        private void addBubbles(float x, float y, int count) {
            for (int index = 0; index < count; index++) {
                Bubble bubble = new Bubble();
                bubble.x = x + (random.nextFloat() - .5f) * width * .055f;
                bubble.y = y + random.nextFloat() * height * .025f;
                bubble.radius = width * (.004f + random.nextFloat() * .009f);
                bubble.speed = height * (.07f + random.nextFloat() * .08f);
                bubble.life = 1.8f + random.nextFloat() * 1.6f;
                bubble.maxLife = bubble.life;
                bubble.phase = random.nextFloat() * 6f;
                bubbles.add(bubble);
            }
        }

        private void drawBubbles(Canvas canvas) {
            bubblePaint.setStyle(Paint.Style.STROKE);
            bubblePaint.setStrokeWidth(Math.max(1.5f, width * .0016f));
            for (Bubble bubble : bubbles) {
                float progress = 1f - bubble.life / bubble.maxLife;
                int alpha = Math.round(165f * (1f - progress));
                bubblePaint.setColor(Color.argb(alpha, 210, 247, 250));
                canvas.drawCircle(bubble.x, bubble.y, bubble.radius * (1f + progress * .45f), bubblePaint);
                bubblePaint.setColor(Color.argb(alpha / 2, 255, 255, 255));
                canvas.drawCircle(bubble.x - bubble.radius * .25f, bubble.y - bubble.radius * .25f,
                    bubble.radius * .18f, bubblePaint);
            }
        }

        private void drawCameraFinish(Canvas canvas) {
            overlayPaint.setShader(new RadialGradient(width * .52f, height * .43f,
                Math.max(width, height) * .72f,
                new int[] { 0x00000000, 0x08000D1A, 0x4A00121E },
                new float[] { 0f, .64f, 1f }, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, width, height, overlayPaint);
            overlayPaint.setShader(null);

            overlayPaint.setColor(0x0DFFFFFF);
            float step = Math.max(11f, width / 72f);
            for (float y = step * .5f; y < height; y += step) {
                float shift = ((int) (y / step) % 3) * 2f;
                for (float x = step * .5f + shift; x < width; x += step * 1.7f) {
                    canvas.drawPoint(x, y, overlayPaint);
                }
            }
        }

        private float clamp(float value, float minimum, float maximum) {
            return Math.max(minimum, Math.min(maximum, value));
        }
    }

    private enum Kind { FISH, SHARK, WHALE, TURTLE, JELLY }

    private static final class Swimmer {
        Bitmap bitmap;
        Kind kind;
        float x;
        float lane;
        float size;
        float baseSpeed;
        float depth;
        float phase;
        float mood;
        float wave;
        float tailRate;
        float boost;
        float passCooldown;
        boolean facingRight;
        boolean interactive;

        float currentY(int height) {
            return height * (lane + (float) Math.sin(phase * .19f + mood) * wave);
        }
    }

    private static final class Bubble {
        float x;
        float y;
        float radius;
        float speed;
        float phase;
        float life;
        float maxLife;
    }
}
