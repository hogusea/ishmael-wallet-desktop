IOS_PROJECT="$(find ios -maxdepth 2 -name project.pbxproj | head -n 1)"
vim "$IOS_PROJECT"
vim android/app/build.gradle
vim package.json
vim package-lock.json
