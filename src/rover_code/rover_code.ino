/*
  Rover - ESP32 WROOM + Dual L298N

  Bluetooth Serial commands:
    F = forward
    B = backward
    L = turn left
    R = turn right
    S = stop

  LEFT L298N  (front-left + rear-left motors)
    ENA -> GPIO 14   ENB -> GPIO 25
    IN1 -> GPIO 27   IN2 -> GPIO 26   (front-left)
    IN3 -> GPIO 33   IN4 -> GPIO 32   (rear-left)

  RIGHT L298N (front-right + rear-right motors)
    ENA -> GPIO 19   ENB -> GPIO 17
    IN1 -> GPIO 18   IN2 -> GPIO 5    (front-right)
    IN3 -> GPIO 16   IN4 -> GPIO 4    (rear-right)

  ENA/ENB are held HIGH permanently at full speed. The host sends one
  movement byte, waits for the command duration, then sends S. The firmware
  also has a 2.5s safety timeout in case the stop byte is missed.
*/

#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

const unsigned long COMMAND_TIMEOUT_MS = 2500;
unsigned long lastMotionCommandMs = 0;

// --- Left driver ---
#define L_ENA 14
#define L_IN1 27
#define L_IN2 26
#define L_ENB 25
#define L_IN3 33
#define L_IN4 32

// --- Right driver ---
#define R_ENA 19
#define R_IN1 18
#define R_IN2  5
#define R_ENB 17
#define R_IN3 16
#define R_IN4  4

void setLeftDir(int dir) {
  bool fwd = (dir > 0);
  digitalWrite(L_IN1, fwd ? HIGH : LOW);
  digitalWrite(L_IN2, fwd ? LOW  : HIGH);
  digitalWrite(L_IN3, fwd ? HIGH : LOW);
  digitalWrite(L_IN4, fwd ? LOW  : HIGH);
}

void setRightDir(int dir) {
  bool fwd = (dir > 0);
  digitalWrite(R_IN1, fwd ? HIGH : LOW);
  digitalWrite(R_IN2, fwd ? LOW  : HIGH);
  digitalWrite(R_IN3, fwd ? HIGH : LOW);
  digitalWrite(R_IN4, fwd ? LOW  : HIGH);
}

void markMotionCommand() {
  lastMotionCommandMs = millis();
}

void driveForward() {
  setLeftDir(1);
  setRightDir(1);
  markMotionCommand();
}

void driveBackward() {
  setLeftDir(-1);
  setRightDir(-1);
  markMotionCommand();
}

void turnLeft() {
  setLeftDir(-1);
  setRightDir(1);
  markMotionCommand();
}

void turnRight() {
  setLeftDir(1);
  setRightDir(-1);
  markMotionCommand();
}

void stopAll() {
  digitalWrite(L_IN1, LOW); digitalWrite(L_IN2, LOW);
  digitalWrite(L_IN3, LOW); digitalWrite(L_IN4, LOW);
  digitalWrite(R_IN1, LOW); digitalWrite(R_IN2, LOW);
  digitalWrite(R_IN3, LOW); digitalWrite(R_IN4, LOW);
  lastMotionCommandMs = 0;
}

void setup() {
  Serial.begin(115200);

  int allPins[] = {
    L_ENA, L_IN1, L_IN2, L_ENB, L_IN3, L_IN4,
    R_ENA, R_IN1, R_IN2, R_ENB, R_IN3, R_IN4
  };
  for (int p : allPins) pinMode(p, OUTPUT);

  digitalWrite(L_ENA, HIGH);
  digitalWrite(L_ENB, HIGH);
  digitalWrite(R_ENA, HIGH);
  digitalWrite(R_ENB, HIGH);

  stopAll();

  SerialBT.begin("Rover");
  Serial.println("Ready - USB serial and Bluetooth ('Rover') active");
}

void handleCommand(char cmd) {
  if (cmd == '\r' || cmd == '\n' || cmd == ' ') return;

  Serial.print("CMD: ");
  Serial.println(cmd);

  switch (cmd) {
    case 'F': case 'f': driveForward();  break;
    case 'B': case 'b': driveBackward(); break;
    case 'L': case 'l': turnLeft();      break;
    case 'R': case 'r': turnRight();     break;
    case 'S': case 's':
    default:             stopAll();      break;
  }
}

void loop() {
  if (Serial.available())   handleCommand(Serial.read());
  if (SerialBT.available()) handleCommand(SerialBT.read());

  if (lastMotionCommandMs > 0 && millis() - lastMotionCommandMs > COMMAND_TIMEOUT_MS) {
    stopAll();
  }
}
