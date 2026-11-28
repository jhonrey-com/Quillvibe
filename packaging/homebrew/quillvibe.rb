cask "quillvibe" do
  version "3.3.7"
  sha256 :no_check

  url "https://github.com/jhonrey-com/Quillvibe/releases/download/v#{version}/Quillvibe_#{version}_universal.dmg"
  name "Quillvibe"
  desc "Desktop book writing, proofreading, story bible, cover studio, and typesetting app"
  homepage "https://github.com/jhonrey-com/Quillvibe"

  app "Quillvibe.app"

  zap trash: [
    "~/Library/Application Support/app.quillvibe.studio",
    "~/Library/Preferences/app.quillvibe.studio.plist",
  ]
end
