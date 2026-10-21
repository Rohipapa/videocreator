import { Config } from "@remotion/cli/config";

// 영상·글꼴은 assets/에 둔다(원본·변환본은 .gitignore로 커밋에서 뺀다).
Config.setPublicDir("assets");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCrf(16);
