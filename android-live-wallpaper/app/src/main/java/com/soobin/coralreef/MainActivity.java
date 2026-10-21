package com.soobin.coralreef;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

public class MainActivity extends Activity {
    static final String PREFS = "reef_wallpaper_settings";
    static final String SPEED = "speed";
    static final String COUNT = "count";

    private final int cream = Color.rgb(245, 238, 205);
    private final int teal = Color.rgb(30, 127, 139);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(6, 56, 74));
        getWindow().setNavigationBarColor(Color.rgb(3, 42, 58));

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(dp(24), dp(38), dp(24), dp(28));
        page.setBackgroundColor(Color.rgb(5, 66, 86));

        TextView title = label("나의 산호초 바다", 30, cream);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, Typeface.BOLD);
        page.addView(title, fullWidth(dp(72)));

        TextView intro = label("물고기들이 화면 뒤에서 계속 헤엄치는\n안드로이드 라이브 배경화면", 16, Color.rgb(193, 230, 224));
        intro.setGravity(Gravity.CENTER);
        page.addView(intro, fullWidth(dp(76)));

        Button setWallpaper = actionButton(getString(R.string.set_wallpaper), true);
        setWallpaper.setOnClickListener(view -> openWallpaperPreview());
        page.addView(setWallpaper, fullWidth(dp(58)));

        addSpacer(page, 18);
        page.addView(label(getString(R.string.speed_label), 15, cream), fullWidth(dp(30)));
        SeekBar speed = new SeekBar(this);
        speed.setMax(100);
        speed.setProgress(preferences.getInt(SPEED, 52));
        speed.setOnSeekBarChangeListener(saveProgress(preferences, SPEED));
        page.addView(speed, fullWidth(dp(52)));

        page.addView(label(getString(R.string.count_label), 15, cream), fullWidth(dp(30)));
        SeekBar count = new SeekBar(this);
        count.setMax(16);
        count.setProgress(Math.max(0, preferences.getInt(COUNT, 11) - 6));
        count.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int value, boolean fromUser) {
                if (fromUser) preferences.edit().putInt(COUNT, value + 6).apply();
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) { }
            @Override public void onStopTrackingTouch(SeekBar seekBar) { }
        });
        page.addView(count, fullWidth(dp(52)));

        Button editor = actionButton(getString(R.string.open_editor), false);
        editor.setOnClickListener(view -> startActivity(new Intent(Intent.ACTION_VIEW,
            Uri.parse("https://my-coral-reef-mobile.dleldjf.chatgpt.site/"))));
        page.addView(editor, fullWidth(dp(54)));

        TextView tip = label("홈 화면을 누르면 거품이 올라오고,\n가까운 물고기 한 마리만 앞으로 달아나요.", 13, Color.rgb(157, 208, 207));
        tip.setGravity(Gravity.CENTER);
        page.addView(tip, fullWidth(dp(72)));

        setContentView(page);
    }

    private SeekBar.OnSeekBarChangeListener saveProgress(SharedPreferences preferences, String key) {
        return new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int value, boolean fromUser) {
                if (fromUser) preferences.edit().putInt(key, value).apply();
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) { }
            @Override public void onStopTrackingTouch(SeekBar seekBar) { }
        };
    }

    private void openWallpaperPreview() {
        ComponentName component = new ComponentName(this, ReefWallpaperService.class);
        Intent direct = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
            .putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, component);
        try {
            startActivity(direct);
        } catch (Exception unavailable) {
            startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
        }
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    private Button actionButton(String text, boolean primary) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.rgb(2, 53, 68) : cream);
        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(24));
        background.setColor(primary ? Color.rgb(245, 220, 144) : Color.rgb(21, 91, 107));
        background.setStroke(dp(1), primary ? Color.rgb(255, 237, 180) : teal);
        button.setBackground(background);
        return button;
    }

    private LinearLayout.LayoutParams fullWidth(int height) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, height);
        params.setMargins(0, dp(5), 0, dp(5));
        return params;
    }

    private void addSpacer(LinearLayout page, int height) {
        View spacer = new View(this);
        page.addView(spacer, new LinearLayout.LayoutParams(1, dp(height)));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
