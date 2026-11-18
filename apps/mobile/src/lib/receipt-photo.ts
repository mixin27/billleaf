import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"
import { Alert, Linking } from "react-native"

export type ReceiptPhoto = { uri: string; width: number; height: number }

/** Long edge of the saved photo: sharp enough to read, well under 5 MB. */
const MAX_EDGE = 2000

/**
 * Take or pick a receipt photo and save it as a JPEG (iPhones shoot HEIC,
 * which the API doesn't accept). Null when cancelled or not allowed.
 */
export async function pickReceiptPhoto(
  source: "camera" | "library"
): Promise<ReceiptPhoto | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        "Camera access is off",
        "Allow Billleaf to use the camera in Settings to photograph receipts.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]
      )
      return null
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null

  const ctx = ImageManipulator.manipulate(asset.uri)
  if (Math.max(asset.width, asset.height) > MAX_EDGE)
    ctx.resize(
      asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE }
    )
  const image = await ctx.renderAsync()
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
  })
  return { uri: saved.uri, width: saved.width, height: saved.height }
}
