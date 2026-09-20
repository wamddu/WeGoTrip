package com.travel.travelbackend.entity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
@Entity @Table(name = "user_consent") @Getter @NoArgsConstructor
public class UserConsent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(nullable = false, length = 30) private String consentType;
    @Column(nullable = false, length = 20) private String version;
    @Column(nullable = false) private Instant agreedAt;
    public UserConsent(User user, String type, String version, Instant now) {
        this.user = user; consentType = type; this.version = version; agreedAt = now;
    }
}
