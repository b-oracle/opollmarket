const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/x-php; charset=utf-8",
  "Content-Disposition": "attachment; filename=opoll-embed.php",
};

const WP_PLUGIN = `<?php
/**
 * Plugin Name: OPollmarket Market Embed
 * Plugin URI: https://opoll.org
 * Description: Embed OPollmarket prediction markets on your WordPress site using shortcodes.
 * Version: 1.0.0
 * Author: OPollmarket
 * License: MIT
 */

if (!defined('ABSPATH')) exit;

// Register shortcode [opoll market="MARKET_ID"]
function opoll_market_shortcode($atts) {
    $atts = shortcode_atts(array(
        'market' => '',
        'width' => '100%',
        'height' => '320',
        'theme' => 'dark',
    ), $atts, 'opoll');

    if (empty($atts['market'])) {
        return '<p style="color:#888;">OPollmarket: Please provide a market ID. Usage: [opoll market="your-market-id"]</p>';
    }

    $market_id = sanitize_text_field($atts['market']);
    $width = sanitize_text_field($atts['width']);
    $height = intval($atts['height']);
    $theme = sanitize_text_field($atts['theme']);

    return sprintf(
        '<iframe src="https://opoll.org/embed/market/%s?theme=%s" width="%s" height="%dpx" frameborder="0" style="border-radius:12px;max-width:100%%;" loading="lazy" title="OPollmarket Market"></iframe>',
        esc_attr($market_id),
        esc_attr($theme),
        esc_attr($width),
        $height
    );
}
add_shortcode('opoll', 'opoll_market_shortcode');

// Register ticker shortcode [opoll_ticker]
function opoll_ticker_shortcode($atts) {
    $atts = shortcode_atts(array(
        'width' => '100%',
        'height' => '56',
        'limit' => '10',
    ), $atts, 'opoll_ticker');

    $width = sanitize_text_field($atts['width']);
    $height = intval($atts['height']);
    $limit = intval($atts['limit']);

    return sprintf(
        '<iframe src="https://opoll.org/embed/ticker?limit=%d" width="%s" height="%dpx" frameborder="0" style="border-radius:8px;max-width:100%%;" loading="lazy" title="OPollmarket Ticker"></iframe>',
        $limit,
        esc_attr($width),
        $height
    );
}
add_shortcode('opoll_ticker', 'opoll_ticker_shortcode');

// Register SDK script shortcode [opoll_sdk api_key="YOUR_KEY"]
function opoll_sdk_shortcode($atts) {
    $atts = shortcode_atts(array(
        'api_key' => '',
    ), $atts, 'opoll_sdk');

    $output = '<script src="https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/sdk-js"></script>';
    
    if (!empty($atts['api_key'])) {
        $api_key = sanitize_text_field($atts['api_key']);
        $output .= sprintf(
            '<script>window.opoll = new OPollmarket({ apiKey: "%s" });</script>',
            esc_js($api_key)
        );
    }

    return $output;
}
add_shortcode('opoll_sdk', 'opoll_sdk_shortcode');

// Admin settings page
function opoll_admin_menu() {
    add_options_page('OPollmarket Settings', 'OPollmarket Embed', 'manage_options', 'opoll-settings', 'opoll_settings_page');
}
add_action('admin_menu', 'opoll_admin_menu');

function opoll_settings_page() {
    ?>
    <div class="wrap">
        <h1>OPollmarket Market Embed</h1>
        <h2>Shortcodes</h2>
        <table class="form-table">
            <tr><th>Market Embed</th><td><code>[opoll market="MARKET_ID"]</code><br><small>Options: width, height, theme (dark/light)</small></td></tr>
            <tr><th>Market Ticker</th><td><code>[opoll_ticker]</code><br><small>Options: width, height, limit</small></td></tr>
            <tr><th>Load SDK</th><td><code>[opoll_sdk api_key="YOUR_API_KEY"]</code></td></tr>
        </table>
        <h2>Examples</h2>
        <pre>[opoll market="abc123" width="400" height="320"]</pre>
        <pre>[opoll_ticker limit="5" height="56"]</pre>
        <p>Get your API key at <a href="https://opoll.org" target="_blank">opoll.org</a></p>
    </div>
    <?php
}
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(WP_PLUGIN, { headers: corsHeaders });
});
