"""
TikTok Studio upload preparation & placeholder API integration.

TikTok does not provide a public API for direct video uploads through
TikTok Studio. This module:

1. Prepares clips in TikTok-optimal format (already done by rendering.py)
2. Generates metadata files that match TikTok Studio's expected format
3. Provides placeholder hooks for future API integration
4. Can open TikTok Studio upload page via browser automation (optional)

When TikTok Content Posting API becomes available for your use case,
the upload_clip() function can be implemented with real API calls.
"""

import json
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# TikTok Content Posting API base URL (requires approved developer access)
TIKTOK_API_BASE = "https://open.tiktokapis.com/v2"


@dataclass
class TikTokUploadSpec:
    """Metadata for a TikTok upload."""
    video_path: str
    title: str                    # Auto-generated from header
    description: str              # From transcript summary
    hashtags: list[str]
    sound_original: bool = True
    allow_comments: bool = True
    allow_duet: bool = True
    allow_stitch: bool = True
    privacy_level: str = "public"  # "public", "friends", "private"
    schedule_time: Optional[str] = None  # ISO 8601 for scheduled posts


def generate_hashtags(transcript: str, label: str, max_tags: int = 5) -> list[str]:
    """Generate relevant hashtags from clip content."""
    # Base tags that apply to all clips
    tags = ["#fyp", "#foryou", "#viral"]

    # Label-based tags
    label_tags = {
        "hook": ["#hook", "#mustwatch"],
        "story": ["#storytime", "#storytelling"],
        "shocking": ["#shocking", "#mindblown"],
        "emotional": ["#emotional", "#feels"],
        "viral": ["#trending", "#viralvideo"],
        "punchy": ["#facts", "#truth"],
        "dynamic": ["#energy", "#motivation"],
    }
    tags.extend(label_tags.get(label, ["#content"]))

    return tags[:max_tags]


def prepare_upload(
    clip_path: str,
    header_text: str,
    transcript: str,
    label: str,
    rank: int,
) -> TikTokUploadSpec:
    """
    Prepare upload metadata for a clip.
    Returns a spec that can be used for manual upload or future API integration.
    """
    hashtags = generate_hashtags(transcript, label)
    hashtag_str = " ".join(hashtags)

    # Build description from transcript (first ~150 chars)
    desc_preview = transcript[:140].rsplit(" ", 1)[0] if len(transcript) > 140 else transcript
    description = f"{desc_preview}... {hashtag_str}"

    return TikTokUploadSpec(
        video_path=clip_path,
        title=header_text,
        description=description,
        hashtags=hashtags,
    )


def save_upload_specs(specs: list[TikTokUploadSpec], output_dir: str):
    """Save upload specs as JSON for reference or future automation."""
    data = []
    for spec in specs:
        data.append({
            "video_path": spec.video_path,
            "title": spec.title,
            "description": spec.description,
            "hashtags": spec.hashtags,
            "privacy_level": spec.privacy_level,
            "allow_comments": spec.allow_comments,
            "allow_duet": spec.allow_duet,
            "allow_stitch": spec.allow_stitch,
            "schedule_time": spec.schedule_time,
        })

    path = Path(output_dir) / "tiktok_upload_specs.json"
    path.write_text(json.dumps(data, indent=2))
    logger.info(f"Saved {len(specs)} upload specs to {path}")


def upload_clip(spec: TikTokUploadSpec, access_token: str) -> dict:
    """
    Placeholder for TikTok Content Posting API upload.

    To use this, you need:
    1. A TikTok Developer account (https://developers.tiktok.com/)
    2. An approved app with Content Posting API access
    3. User OAuth token with video.upload scope

    The flow is:
    1. POST /v2/post/publish/inbox/video/init/ -> get upload_url
    2. PUT video binary to upload_url
    3. POST /v2/post/publish/video/init/ with metadata
    4. Poll /v2/post/publish/status/fetch/ until complete

    See: https://developers.tiktok.com/doc/content-posting-api-get-started
    """
    logger.warning(
        "TikTok upload API not implemented — upload manually via TikTok Studio. "
        f"File: {spec.video_path}"
    )

    # Return placeholder response
    return {
        "status": "not_implemented",
        "message": "Upload manually to TikTok Studio",
        "file": spec.video_path,
        "suggested_title": spec.title,
        "suggested_description": spec.description,
    }


def open_tiktok_studio():
    """Open TikTok Studio in the default browser for manual upload."""
    import webbrowser
    webbrowser.open("https://www.tiktok.com/creator#/upload")
    logger.info("Opened TikTok Studio in browser")
