package com.travel.travelbackend.entity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
@Entity @Table(name = "user_device") @Getter @NoArgsConstructor
public class UserDevice {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, unique = true, length = 500) private String fcmToken;
    @Column(nullable = false, length = 10) private String deviceType;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant lastActiveAt;
    public UserDevice(User user, Instant now) { this.user = user; createdAt = now; }
    public void update(String token, String type, Instant now) {
        fcmToken = token; deviceType = type; lastActiveAt = now;
    }
}
