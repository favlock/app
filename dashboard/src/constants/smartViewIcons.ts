import {
  Archive, Atom, Award, Bell, Bike, Book, BookOpen, Bookmark, Box, Briefcase,
  Bus, Calendar, Camera, Car, Check, Circle, Clock, Cloud, Code, Compass, Coffee,
  Crown, Diamond, File, Film, Flag, Flame, Flower, Folder, Footprints, Gift, Globe,
  Heart, Home, Image, Key, Leaf, Lightbulb, Link, List, Lock, Mail, Map, MapPin,
  MessageCircle, Moon, Mountain, Music, Palette, Pin, Plane, Rocket, Search, Shield,
  Ship, Sparkles, Star, Sun, TrainFront, Truck,
  type LucideIcon,
} from "lucide-react";

export const SMART_VIEW_ICONS: { id: string; label: string; Icon: LucideIcon }[] = [
  ["archive", "Archive", Archive], ["atom", "Atom", Atom], ["award", "Award", Award],
  ["bell", "Bell", Bell], ["book", "Book", Book], ["book-open", "Open book", BookOpen],
  ["bookmark", "Bookmark", Bookmark], ["box", "Box", Box], ["briefcase", "Briefcase", Briefcase],
  ["calendar", "Calendar", Calendar], ["camera", "Camera", Camera], ["check", "Check", Check],
  ["circle", "Circle", Circle], ["clock", "Clock", Clock], ["cloud", "Cloud", Cloud],
  ["code", "Code", Code], ["compass", "Compass", Compass], ["coffee", "Coffee", Coffee],
  ["crown", "Crown", Crown], ["diamond", "Diamond", Diamond], ["file", "File", File],
  ["film", "Film", Film], ["flag", "Flag", Flag], ["flame", "Flame", Flame],
  ["flower", "Flower", Flower], ["folder", "Folder", Folder], ["gift", "Gift", Gift],
  ["globe", "Globe", Globe], ["heart", "Heart", Heart], ["home", "Home", Home],
  ["image", "Image", Image], ["key", "Key", Key], ["leaf", "Leaf", Leaf],
  ["lightbulb", "Lightbulb", Lightbulb], ["link", "Link", Link], ["list", "List", List],
  ["lock", "Lock", Lock], ["mail", "Mail", Mail], ["map", "Map", Map],
  ["message", "Message", MessageCircle], ["moon", "Moon", Moon], ["music", "Music", Music],
  ["palette", "Palette", Palette], ["pin", "Pin", Pin], ["rocket", "Rocket", Rocket],
  ["search", "Search", Search], ["shield", "Shield", Shield], ["sparkles", "Sparkles", Sparkles],
  ["star", "Star", Star], ["sun", "Sun", Sun],
  ["bike", "Bike", Bike], ["bus", "Bus", Bus], ["car", "Car", Car],
  ["footprints", "Footprints", Footprints], ["map-pin", "Map pin", MapPin],
  ["mountain", "Mountain", Mountain], ["plane", "Plane", Plane],
  ["ship", "Ship", Ship], ["train-front", "Train", TrainFront], ["truck", "Truck", Truck],
].map(([id, label, Icon]) => ({ id, label, Icon })) as { id: string; label: string; Icon: LucideIcon }[];

export function smartViewIcon(id: string): LucideIcon {
  return SMART_VIEW_ICONS.find((item) => item.id === id)?.Icon ?? Sparkles;
}
